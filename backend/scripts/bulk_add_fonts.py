"""
Bulk-download Google Fonts and register them in the DB + MinIO.

Usage (inside container):
  python -m scripts.bulk_add_fonts

Downloads TTF files via Google Fonts CSS API, uploads to MinIO, creates DB records.
"""
import asyncio
import re
import uuid
import httpx
import boto3
from botocore.client import Config as BotoConfig

# --- Configuration ---
MINIO_ENDPOINT = "http://minio:9000"
MINIO_ACCESS = "minioadmin"
MINIO_SECRET = "minioadmin123"
MINIO_BUCKET = "invitation-video"

GOOGLE_CSS_URL = "https://fonts.googleapis.com/css2"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

# Fonts categorized by language with display names and preview text
FONT_LISTS = {
    "gujarati": {
        "preview": "શુભ લગ્ન",
        "families": [
            # === ALL 13 Google Fonts Gujarati families ===
            # Each with every available weight variant for maximum festive variety
            # --- Noto Sans Gujarati (clean, modern) ---
            "Noto Sans Gujarati",
            "Noto Sans Gujarati:wght@100",
            "Noto Sans Gujarati:wght@200",
            "Noto Sans Gujarati:wght@300",
            "Noto Sans Gujarati:wght@500",
            "Noto Sans Gujarati:wght@600",
            "Noto Sans Gujarati:wght@700",
            "Noto Sans Gujarati:wght@800",
            "Noto Sans Gujarati:wght@900",
            # --- Noto Serif Gujarati (elegant, traditional) ---
            "Noto Serif Gujarati",
            "Noto Serif Gujarati:wght@100",
            "Noto Serif Gujarati:wght@200",
            "Noto Serif Gujarati:wght@300",
            "Noto Serif Gujarati:wght@500",
            "Noto Serif Gujarati:wght@600",
            "Noto Serif Gujarati:wght@700",
            "Noto Serif Gujarati:wght@800",
            "Noto Serif Gujarati:wght@900",
            # --- Baloo Bhai 2 (playful, festive - great for baby shower / sangeet) ---
            "Baloo Bhai 2",
            "Baloo Bhai 2:wght@500",
            "Baloo Bhai 2:wght@600",
            "Baloo Bhai 2:wght@700",
            "Baloo Bhai 2:wght@800",
            # --- Hind Vadodara (clean body text, versatile) ---
            "Hind Vadodara",
            "Hind Vadodara:wght@300",
            "Hind Vadodara:wght@500",
            "Hind Vadodara:wght@600",
            "Hind Vadodara:wght@700",
            # --- Mukta Vaani (warm, friendly - engagement, roka) ---
            "Mukta Vaani",
            "Mukta Vaani:wght@200",
            "Mukta Vaani:wght@300",
            "Mukta Vaani:wght@500",
            "Mukta Vaani:wght@600",
            "Mukta Vaani:wght@700",
            "Mukta Vaani:wght@800",
            # --- Rasa (graceful serif - wedding, reception) ---
            "Rasa",
            "Rasa:wght@300",
            "Rasa:wght@500",
            "Rasa:wght@600",
            "Rasa:wght@700",
            "Rasa:ital@1",
            "Rasa:wght@300;ital@1",
            "Rasa:wght@500;ital@1",
            "Rasa:wght@600;ital@1",
            "Rasa:wght@700;ital@1",
            # --- Shrikhand (bold display - haldi, garba night) ---
            "Shrikhand",
            # --- Anek Gujarati (variable, modern - all occasions) ---
            "Anek Gujarati",
            "Anek Gujarati:wght@100",
            "Anek Gujarati:wght@200",
            "Anek Gujarati:wght@300",
            "Anek Gujarati:wght@500",
            "Anek Gujarati:wght@600",
            "Anek Gujarati:wght@700",
            "Anek Gujarati:wght@800",
            # --- Kumar One (decorative display - festive headers) ---
            "Kumar One",
            # --- Kumar One Outline (outlined display - unique invites) ---
            "Kumar One Outline",
            # --- Mogra (handwritten feel - mehendi, sangeet) ---
            "Mogra",
            # --- Farsan (casual script - casual gatherings) ---
            "Farsan",
            # --- Sura (elegant serif - traditional ceremonies) ---
            "Sura",
        ],
    },
    "hindi": {
        "preview": "शुभ विवाह",
        "families": [
            # === ALL 62 Google Fonts Devanagari families ===
            # Perfect for weddings, engagements, baby showers, festivals
            # --- Noto Sans Devanagari (versatile, clean) ---
            "Noto Sans Devanagari",
            "Noto Sans Devanagari:wght@100",
            "Noto Sans Devanagari:wght@200",
            "Noto Sans Devanagari:wght@300",
            "Noto Sans Devanagari:wght@500",
            "Noto Sans Devanagari:wght@600",
            "Noto Sans Devanagari:wght@700",
            "Noto Sans Devanagari:wght@800",
            "Noto Sans Devanagari:wght@900",
            # --- Noto Serif Devanagari (elegant, traditional wedding) ---
            "Noto Serif Devanagari",
            "Noto Serif Devanagari:wght@100",
            "Noto Serif Devanagari:wght@200",
            "Noto Serif Devanagari:wght@300",
            "Noto Serif Devanagari:wght@500",
            "Noto Serif Devanagari:wght@600",
            "Noto Serif Devanagari:wght@700",
            "Noto Serif Devanagari:wght@800",
            "Noto Serif Devanagari:wght@900",
            # --- Noto Sans (multilingual fallback) ---
            "Noto Sans",
            "Noto Sans:wght@300",
            "Noto Sans:wght@500",
            "Noto Sans:wght@700",
            "Noto Sans:wght@900",
            # --- Baloo 2 (playful, festive - baby shower, birthday) ---
            "Baloo 2",
            "Baloo 2:wght@500",
            "Baloo 2:wght@600",
            "Baloo 2:wght@700",
            "Baloo 2:wght@800",
            # --- Hind (clean, multipurpose) ---
            "Hind",
            "Hind:wght@300",
            "Hind:wght@500",
            "Hind:wght@600",
            "Hind:wght@700",
            # --- Tiro Devanagari (classical, ceremonial) ---
            "Tiro Devanagari Hindi",
            "Tiro Devanagari Hindi:ital@1",
            "Tiro Devanagari Sanskrit",
            "Tiro Devanagari Sanskrit:ital@1",
            "Tiro Devanagari Marathi",
            "Tiro Devanagari Marathi:ital@1",
            # --- Yatra One (bold display - garba, navratri) ---
            "Yatra One",
            # --- Kalam (handwritten - mehendi, informal) ---
            "Kalam",
            "Kalam:wght@300",
            "Kalam:wght@700",
            # --- Martel (elegant serif - wedding, puja) ---
            "Martel",
            "Martel:wght@200",
            "Martel:wght@300",
            "Martel:wght@600",
            "Martel:wght@700",
            "Martel:wght@800",
            "Martel:wght@900",
            # --- Martel Sans (clean companion) ---
            "Martel Sans",
            "Martel Sans:wght@200",
            "Martel Sans:wght@300",
            "Martel Sans:wght@600",
            "Martel Sans:wght@700",
            "Martel Sans:wght@800",
            "Martel Sans:wght@900",
            # --- Poppins (modern, trendy - engagement, reception) ---
            "Poppins",
            "Poppins:wght@100",
            "Poppins:wght@200",
            "Poppins:wght@300",
            "Poppins:wght@500",
            "Poppins:wght@600",
            "Poppins:wght@700",
            "Poppins:wght@800",
            "Poppins:wght@900",
            "Poppins:ital@1",
            "Poppins:wght@300;ital@1",
            "Poppins:wght@700;ital@1",
            # --- Rajdhani (geometric, modern - save the date) ---
            "Rajdhani",
            "Rajdhani:wght@300",
            "Rajdhani:wght@500",
            "Rajdhani:wght@600",
            "Rajdhani:wght@700",
            # --- Mukta (friendly body text) ---
            "Mukta",
            "Mukta:wght@200",
            "Mukta:wght@300",
            "Mukta:wght@500",
            "Mukta:wght@600",
            "Mukta:wght@700",
            "Mukta:wght@800",
            # --- Tillana (decorative, festive - diwali, holi) ---
            "Tillana",
            "Tillana:wght@500",
            "Tillana:wght@600",
            "Tillana:wght@700",
            "Tillana:wght@800",
            # --- Halant (refined serif) ---
            "Halant",
            "Halant:wght@300",
            "Halant:wght@500",
            "Halant:wght@600",
            "Halant:wght@700",
            # --- Karma (traditional serif - religious ceremonies) ---
            "Karma",
            "Karma:wght@300",
            "Karma:wght@500",
            "Karma:wght@600",
            "Karma:wght@700",
            # --- Laila (warm, inviting - all celebrations) ---
            "Laila",
            "Laila:wght@300",
            "Laila:wght@500",
            "Laila:wght@600",
            "Laila:wght@700",
            # --- Gotu (clean display) ---
            "Gotu",
            # --- Anek Devanagari (variable, modern) ---
            "Anek Devanagari",
            "Anek Devanagari:wght@100",
            "Anek Devanagari:wght@200",
            "Anek Devanagari:wght@300",
            "Anek Devanagari:wght@500",
            "Anek Devanagari:wght@600",
            "Anek Devanagari:wght@700",
            "Anek Devanagari:wght@800",
            # --- Vesper Libre (elegant, literary) ---
            "Vesper Libre",
            "Vesper Libre:wght@500",
            "Vesper Libre:wght@700",
            "Vesper Libre:wght@900",
            # --- Biryani (geometric sans) ---
            "Biryani",
            "Biryani:wght@200",
            "Biryani:wght@300",
            "Biryani:wght@600",
            "Biryani:wght@700",
            "Biryani:wght@800",
            "Biryani:wght@900",
            # --- Rozha One (bold display - festival headers) ---
            "Rozha One",
            # --- Palanquin (clean, modern) ---
            "Palanquin",
            "Palanquin:wght@100",
            "Palanquin:wght@200",
            "Palanquin:wght@300",
            "Palanquin:wght@500",
            "Palanquin:wght@600",
            "Palanquin:wght@700",
            # --- Palanquin Dark (bolder companion) ---
            "Palanquin Dark",
            "Palanquin Dark:wght@500",
            "Palanquin Dark:wght@600",
            "Palanquin Dark:wght@700",
            # --- Glegoo (warm serif) ---
            "Glegoo",
            "Glegoo:wght@700",
            # --- Amita (decorative, festive - mehendi) ---
            "Amita",
            "Amita:wght@700",
            # --- Eczar (editorial serif) ---
            "Eczar",
            "Eczar:wght@500",
            "Eczar:wght@600",
            "Eczar:wght@700",
            "Eczar:wght@800",
            # --- Sarpanch (bold geometric) ---
            "Sarpanch",
            "Sarpanch:wght@500",
            "Sarpanch:wght@600",
            "Sarpanch:wght@700",
            "Sarpanch:wght@800",
            "Sarpanch:wght@900",
            # --- Modak (thick display - garba, dandiya) ---
            "Modak",
            # --- Khand (condensed sans) ---
            "Khand",
            "Khand:wght@300",
            "Khand:wght@500",
            "Khand:wght@600",
            "Khand:wght@700",
            # --- Teko (condensed display) ---
            "Teko",
            "Teko:wght@300",
            "Teko:wght@500",
            "Teko:wght@600",
            "Teko:wght@700",
            # --- Dekko (handwritten casual - baby shower) ---
            "Dekko",
            # --- Sumana (traditional serif) ---
            "Sumana",
            "Sumana:wght@700",
            # --- Kadwa (heavy serif - bold statements) ---
            "Kadwa",
            "Kadwa:wght@700",
            # --- Jaldi (clean sans) ---
            "Jaldi",
            "Jaldi:wght@700",
            # --- Pragati Narrow (condensed) ---
            "Pragati Narrow",
            "Pragati Narrow:wght@700",
            # === NEW: Missing Devanagari families ===
            # --- Alkatra (decorative, handwritten - festive, fun) ---
            "Alkatra",
            "Alkatra:wght@500",
            "Alkatra:wght@600",
            "Alkatra:wght@700",
            # --- Amiko (clean sans) ---
            "Amiko",
            "Amiko:wght@600",
            "Amiko:wght@700",
            # --- Annapurna SIL (classical, scholarly) ---
            "Annapurna SIL",
            "Annapurna SIL:wght@700",
            # --- Arya (geometric sans) ---
            "Arya",
            "Arya:wght@700",
            # --- Asar (organic, artistic) ---
            "Asar",
            # --- Bakbak One (ultra bold display - party, sangeet) ---
            "Bakbak One",
            # --- Cambay (clean text) ---
            "Cambay",
            "Cambay:wght@700",
            "Cambay:ital@1",
            "Cambay:wght@700;ital@1",
            # --- Gajraj One (ultra bold festive display) ---
            "Gajraj One",
            # --- IBM Plex Sans Devanagari (corporate elegant) ---
            "IBM Plex Sans Devanagari",
            "IBM Plex Sans Devanagari:wght@100",
            "IBM Plex Sans Devanagari:wght@200",
            "IBM Plex Sans Devanagari:wght@300",
            "IBM Plex Sans Devanagari:wght@500",
            "IBM Plex Sans Devanagari:wght@600",
            "IBM Plex Sans Devanagari:wght@700",
            # --- Inknut Antiqua (ornate serif - royal wedding) ---
            "Inknut Antiqua",
            "Inknut Antiqua:wght@300",
            "Inknut Antiqua:wght@500",
            "Inknut Antiqua:wght@600",
            "Inknut Antiqua:wght@700",
            "Inknut Antiqua:wght@800",
            "Inknut Antiqua:wght@900",
            # --- Jaini (decorative traditional) ---
            "Jaini",
            # --- Jaini Purva (decorative traditional variant) ---
            "Jaini Purva",
            # --- Khula (clean, modern sans) ---
            "Khula",
            "Khula:wght@300",
            "Khula:wght@600",
            "Khula:wght@700",
            "Khula:wght@800",
            # --- Kurale (elegant serif) ---
            "Kurale",
            # --- Matangi (decorative display - Diwali, festive) ---
            "Matangi",
            # --- Playpen Sans Deva (playful - baby shower, kids) ---
            "Playpen Sans Deva",
            "Playpen Sans Deva:wght@300",
            "Playpen Sans Deva:wght@500",
            "Playpen Sans Deva:wght@600",
            "Playpen Sans Deva:wght@700",
            "Playpen Sans Deva:wght@800",
            # --- Ranga (display, festive) ---
            "Ranga",
            "Ranga:wght@700",
            # --- Rhodium Libre (elegant serif - formal invitations) ---
            "Rhodium Libre",
            # --- Sahitya (literary serif) ---
            "Sahitya",
            "Sahitya:wght@700",
            # --- Sarala (clean humanist sans) ---
            "Sarala",
            "Sarala:wght@700",
            # --- Sura (traditional serif) ---
            "Sura",
            "Sura:wght@700",
            # --- Yantramanav (geometric sans) ---
            "Yantramanav",
            "Yantramanav:wght@100",
            "Yantramanav:wght@300",
            "Yantramanav:wght@500",
            "Yantramanav:wght@700",
            "Yantramanav:wght@900",
            # --- Akshar (modern sans) ---
            "Akshar",
            "Akshar:wght@300",
            "Akshar:wght@500",
            "Akshar:wght@600",
            "Akshar:wght@700",
            # --- Catamaran (clean geometric) ---
            "Catamaran",
            "Catamaran:wght@100",
            "Catamaran:wght@200",
            "Catamaran:wght@300",
            "Catamaran:wght@500",
            "Catamaran:wght@600",
            "Catamaran:wght@700",
            "Catamaran:wght@800",
            "Catamaran:wght@900",
            # --- Yrsa (elegant text - invitations) ---
            "Yrsa",
            "Yrsa:wght@300",
            "Yrsa:wght@500",
            "Yrsa:wght@600",
            "Yrsa:wght@700",
            "Yrsa:ital@1",
            "Yrsa:wght@300;ital@1",
            "Yrsa:wght@500;ital@1",
            "Yrsa:wght@700;ital@1",
        ],
    },
    "english": {
        "preview": "Wedding",
        "families": [
            # --- Elegant Serif (wedding staples) ---
            "Playfair Display",
            "Cinzel",
            "Cormorant Garamond",
            "Lora",
            "Merriweather",
            "Libre Baskerville",
            "Spectral",
            "Crimson Text",
            "EB Garamond",
            "Cormorant",
            "Bodoni Moda",
            "Cinzel Decorative",
            "Marcellus",
            "Sorts Mill Goudy",
            "Cardo",
            "Forum",
            "Prata",
            "Rufina",
            "Baskervville",
            "Cormorant Infant",
            "Cormorant SC",
            "Cormorant Upright",
            "DM Serif Display",
            "DM Serif Text",
            "Playfair Display SC",
            "Limelight",
            # Additional elegant serifs
            "Libre Caslon Text",
            "Libre Caslon Display",
            "Rozha One",
            "Yeseva One",
            "Oranienbaum",
            "Mate",
            "Mate SC",
            "Antic Didone",
            "GFS Didot",
            "Old Standard TT",
            "Gentium Book Plus",
            "Noto Serif Display",
            "Source Serif 4",
            "Bitter",
            "Vollkorn",
            "Vollkorn SC",
            "Crimson Pro",
            "Newsreader",
            "Piazzolla",
            "Fraunces",
            "Gloock",
            "Instrument Serif",
            "Lora:ital@1",
            # --- Script / Calligraphy (invitations) ---
            "Dancing Script",
            "Alex Brush",
            "Sacramento",
            "Great Vibes",
            "Tangerine",
            "Pinyon Script",
            "Allura",
            "Parisienne",
            "Italianno",
            "Lavishly Yours",
            "Niconne",
            "Euphoria Script",
            "Satisfy",
            "Cookie",
            "Marck Script",
            "Petit Formal Script",
            "Clicker Script",
            "Herr Von Muellerhoff",
            "Monsieur La Doulaise",
            "Mr De Haviland",
            "Rouge Script",
            "Engagement",
            "Lovers Quarrel",
            "Bilbo Swash Caps",
            "Berkshire Swash",
            # Additional script / calligraphy
            "Dawning of a New Day",
            "Carattere",
            "Fleur De Leah",
            "Luxurious Script",
            "Mea Culpa",
            "Petemoss",
            "Sassy Frass",
            "Updock",
            "Waterfall",
            "Style Script",
            "Corinthia",
            "Ballet",
            "Bonheur Royale",
            "Praise",
            "Qwitcher Grypen",
            "Birthstone",
            "Birthstone Bounce",
            "Miss Fajardose",
            "Mrs Saint Delafield",
            "Sevillana",
            "Amiri",
            "Amiri Quran",
            "Ingrid Darling",
            "Island Moments",
            "Love Light",
            "My Soul",
            "Oooh Baby",
            "Shalimar",
            "Whisper",
            # --- Elegant Sans-Serif ---
            "Josefin Sans",
            "Montserrat",
            "Raleway",
            "Oswald",
            "Poiret One",
            "Julius Sans One",
            "Tenor Sans",
            "Belleza",
            "Amatic SC",
            # Additional elegant sans
            "Cormorant Unicase",
            "Marcellus SC",
            "Josefin Slab",
            "Fauna One",
            "Philosopher",
            "Quattrocento",
            "Quattrocento Sans",
            "Alegreya",
            "Alegreya Sans",
            "Alegreya SC",
            "Alegreya Sans SC",
            "Didact Gothic",
            "Jost",
            "Outfit",
            "Urbanist",
            "Gilda Display",
            "Vidaloka",
            "Italiana",
            "Viaoda Libre",
            "Elsie",
            "Elsie Swash Caps",
            "Luxurious Roman",
            "Brygada 1918",
            "Della Respira",
            "Uncial Antiqua",
            "Rosarivo",
            "Caudex",
            "Almendra",
            "Almendra Display",
            "IM Fell English",
            "IM Fell English SC",
            "IM Fell DW Pica",
            "Goudy Bookletter 1911",
            # --- Weight & Style variants ---
            "Playfair Display:wght@500",
            "Playfair Display:wght@700",
            "Playfair Display:ital@1",
            "Cinzel:wght@700",
            "Cinzel:wght@900",
            "Cinzel Decorative:wght@700",
            "Cinzel Decorative:wght@900",
            "Montserrat:wght@300",
            "Montserrat:wght@500",
            "Montserrat:wght@700",
            "Lora:wght@500",
            "Lora:wght@700",
            "Raleway:wght@300",
            "Raleway:wght@500",
            "Raleway:wght@700",
            "Oswald:wght@300",
            "Oswald:wght@500",
            "Oswald:wght@700",
            "Merriweather:wght@300",
            "Merriweather:wght@700",
            "Libre Baskerville:wght@700",
            "Libre Baskerville:ital@1",
            "Spectral:wght@300",
            "Spectral:wght@700",
            "Spectral:ital@1",
            "Crimson Text:wght@700",
            "EB Garamond:wght@700",
            "EB Garamond:ital@1",
            "Cormorant:wght@300",
            "Cormorant:wght@700",
            "Cormorant:ital@1",
            "Bodoni Moda:wght@700",
            "Bodoni Moda:ital@1",
            "DM Serif Display:ital@1",
            "Cormorant Garamond:wght@300",
            "Cormorant Garamond:wght@700",
            "Cormorant Garamond:ital@1",
            "Dancing Script:wght@700",
            "Tangerine:wght@700",
            "Amatic SC:wght@700",
            "Josefin Sans:wght@300",
            "Josefin Sans:wght@500",
            "Josefin Sans:wght@700",
            "Crimson Pro:wght@300",
            "Crimson Pro:wght@700",
            "Crimson Pro:ital@1",
            "Newsreader:wght@300",
            "Newsreader:wght@700",
            "Newsreader:ital@1",
            "Fraunces:wght@300",
            "Fraunces:wght@700",
            "Fraunces:wght@900",
            "Source Serif 4:wght@300",
            "Source Serif 4:wght@700",
            "Source Serif 4:wght@900",
            "Vollkorn:wght@700",
            "Vollkorn:ital@1",
            "Bitter:wght@700",
            "Bitter:ital@1",
            "Alegreya:wght@700",
            "Alegreya:ital@1",
            "Jost:wght@300",
            "Jost:wght@500",
            "Jost:wght@700",
            "Urbanist:wght@300",
            "Urbanist:wght@500",
            "Urbanist:wght@700",
            "Outfit:wght@300",
            "Outfit:wght@500",
            "Outfit:wght@700",
            "Brygada 1918:wght@700",
            "Brygada 1918:ital@1",
            "Piazzolla:wght@300",
            "Piazzolla:wght@700",
            "Piazzolla:ital@1",
        ],
    },
}


def parse_family_spec(spec: str):
    """Parse 'Family Name:wght@700;ital@1' into components."""
    if ":" in spec:
        family, axes_str = spec.split(":", 1)
    else:
        family = spec
        axes_str = ""

    weight = "regular"
    style = "normal"

    if axes_str:
        for part in axes_str.split(";"):
            if part.startswith("wght@"):
                weight = part.split("@")[1]
            elif part.startswith("ital@1"):
                style = "italic"

    return family.strip(), weight, style


def make_display_name(family: str, weight: str, style: str) -> str:
    """Create human-readable display name."""
    weight_names = {
        "regular": "",
        "300": "Light",
        "400": "",
        "500": "Medium",
        "600": "SemiBold",
        "700": "Bold",
        "800": "ExtraBold",
        "900": "Black",
    }
    parts = [family]
    wn = weight_names.get(weight, weight)
    if wn:
        parts.append(wn)
    if style == "italic":
        parts.append("Italic")
    return " ".join(parts)


async def fetch_font_url(client: httpx.AsyncClient, family: str, weight: str, style: str) -> str | None:
    """Get TTF URL from Google Fonts CSS API."""
    # Build CSS2 family spec
    axes = []
    if style == "italic":
        axes.append(("ital", "1"))
    if weight != "regular":
        axes.append(("wght", weight))

    if axes:
        axes_str = ",".join(a[0] for a in axes)
        vals_str = ",".join(a[1] for a in axes)
        param = f"{family}:{axes_str}@{vals_str}"
    else:
        param = family

    try:
        resp = await client.get(
            GOOGLE_CSS_URL,
            params={"family": param, "display": "swap"},
            headers={"User-Agent": USER_AGENT},
        )
        if resp.status_code != 200:
            print(f"  CSS API returned {resp.status_code} for {param}")
            return None

        # Extract TTF/WOFF2 URL
        urls = re.findall(r"url\((https://fonts\.gstatic\.com/[^)]+)\)", resp.text)
        if urls:
            return urls[0]
    except Exception as e:
        print(f"  Error fetching CSS for {param}: {e}")
    return None


async def download_font(client: httpx.AsyncClient, url: str) -> bytes | None:
    """Download font file bytes."""
    try:
        resp = await client.get(url)
        if resp.status_code == 200:
            return resp.content
    except Exception as e:
        print(f"  Download error: {e}")
    return None


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS,
        aws_secret_access_key=MINIO_SECRET,
        config=BotoConfig(signature_version="s3v4"),
        region_name="us-east-1",
    )


async def main():
    from app.database import async_session
    from app.models.font import Font
    from sqlalchemy import select

    s3 = get_s3_client()

    # Get existing fonts to avoid duplicates
    async with async_session() as db:
        result = await db.execute(select(Font.family_name, Font.weight, Font.style))
        existing = {(r[0], r[1], r[2]) for r in result.all()}
        print(f"Existing fonts: {len(existing)}")

    added = 0
    skipped = 0
    failed = 0

    async with httpx.AsyncClient(timeout=30) as client:
        for lang, config in FONT_LISTS.items():
            preview = config["preview"]
            families = config["families"]
            print(f"\n=== {lang.upper()} ({len(families)} variants) ===")

            for spec in families:
                family, weight, style = parse_family_spec(spec)

                # Check duplicate
                if (family, weight, style) in existing:
                    skipped += 1
                    continue

                display_name = make_display_name(family, weight, style)
                print(f"  Adding: {display_name}...", end=" ", flush=True)

                # Fetch URL
                font_url = await fetch_font_url(client, family, weight, style)
                if not font_url:
                    print("SKIP (no URL)")
                    failed += 1
                    continue

                # Download
                font_data = await download_font(client, font_url)
                if not font_data:
                    print("SKIP (download failed)")
                    failed += 1
                    continue

                # Determine file extension
                ext = "woff2" if font_url.endswith(".woff2") else "ttf"
                font_id = uuid.uuid4()
                file_key = f"fonts/{font_id}.{ext}"

                # Upload to MinIO
                try:
                    s3.put_object(
                        Bucket=MINIO_BUCKET,
                        Key=file_key,
                        Body=font_data,
                        ContentType=f"font/{ext}",
                    )
                except Exception as e:
                    print(f"SKIP (upload: {e})")
                    failed += 1
                    continue

                # Create DB record
                async with async_session() as db:
                    font = Font(
                        id=font_id,
                        name=display_name,
                        family_name=family,
                        language=lang,
                        weight=weight,
                        style=style,
                        file_key=file_key,
                        preview_text=preview,
                    )
                    db.add(font)
                    await db.commit()

                existing.add((family, weight, style))
                added += 1
                print("OK")

                # Small delay to be nice to Google
                await asyncio.sleep(0.1)

    print(f"\n=== DONE: added={added}, skipped={skipped}, failed={failed} ===")

    # Print final counts
    async with async_session() as db:
        from sqlalchemy import func
        result = await db.execute(select(Font.language, func.count()).group_by(Font.language))
        for lang, count in result.all():
            print(f"  {lang}: {count} fonts")


if __name__ == "__main__":
    asyncio.run(main())
