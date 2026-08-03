import { AbsoluteFill, Video, staticFile } from "remotion";
import AnimatedText from "../components/AnimatedText";
import AnimatedTextBlock from "../components/AnimatedTextBlock";
import AnimatedImageBlock from "../components/AnimatedImageBlock";
import type { TemplateField, TextBlock, ImageBlock } from "@/types";

interface GenericTemplateProps {
  videoUrl: string | null;
  width: number;
  height: number;
  // New tag-based props
  textBlocks?: TextBlock[];
  tagValues?: Record<string, string>;
  fontFamilies?: Record<string, string>;
  textColorOverrides?: Record<string, string>;
  defaultTextColor?: string;
  defaultFontFamily?: string;
  overrideFontFamily?: string;
  imageBlocks?: ImageBlock[];
  imageUploads?: Record<string, string>;
  // Legacy field-based props (backward compat)
  fields?: TemplateField[];
  fieldValues?: Record<string, string>;
  fontFamily?: string;
}

export default function GenericTemplate({
  videoUrl,
  width,
  height,
  textBlocks,
  tagValues,
  fontFamilies,
  textColorOverrides,
  defaultTextColor,
  defaultFontFamily,
  overrideFontFamily,
  imageBlocks,
  imageUploads,
  fields,
  fieldValues,
  fontFamily,
}: GenericTemplateProps) {
  // Use new text_blocks path if available, otherwise fall back to legacy fields
  const useBlocks = textBlocks && textBlocks.length > 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#1a1a2e" }}>
      {videoUrl && (
        <Video
          src={videoUrl}
          volume={1}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {/* Image blocks layer */}
      {(imageBlocks ?? []).map((block) => {
        const imageUrl =
          imageUploads?.[block.id] || block.placeholder_key || null;
        return (
          <AnimatedImageBlock
            key={block.id}
            block={block}
            imageUrl={imageUrl}
            videoWidth={width}
            videoHeight={height}
          />
        );
      })}

      {useBlocks
        ? textBlocks!.map((block) => (
            <AnimatedTextBlock
              key={block.id}
              block={block}
              tagValues={tagValues ?? {}}
              fontFamilies={fontFamilies ?? {}}
              videoWidth={width}
              videoHeight={height}
              textColorOverrides={textColorOverrides}
              defaultTextColor={defaultTextColor}
              defaultFontFamily={defaultFontFamily}
              overrideFontFamily={overrideFontFamily}
            />
          ))
        : (fields ?? []).map((field) => (
            <AnimatedText
              key={field.id}
              field={field}
              text={(fieldValues ?? {})[field.field_key] || ""}
              fontFamily={fontFamily ?? "sans-serif"}
              videoWidth={width}
              videoHeight={height}
            />
          ))}
    </AbsoluteFill>
  );
}
