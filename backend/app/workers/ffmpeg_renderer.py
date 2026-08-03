import re
import subprocess

from app.models.text_block import TextBlock


class FFmpegRenderer:
    def __init__(
        self,
        source_path: str,
        output_path: str,
        default_font_path: str | None,
        font_paths: dict[str, str],
        text_blocks: list[TextBlock],
        tag_values: dict[str, str],
        width: int,
        height: int,
        text_color_override: dict[str, str] | None = None,
        default_text_color: str | None = None,
    ):
        self.source_path = source_path
        self.output_path = output_path
        self.default_font_path = default_font_path
        self.font_paths = font_paths
        self.text_blocks = text_blocks
        self.tag_values = tag_values
        self.width = width
        self.height = height
        self.text_color_override = text_color_override
        self.default_text_color = default_text_color or "#FFFFFF"

    @staticmethod
    def _escape_drawtext(text: str) -> str:
        """Escape text for FFmpeg drawtext filter."""
        # FFmpeg drawtext needs these chars escaped with backslash
        text = text.replace("\\", "\\\\")
        text = text.replace("'", "\u2019")  # Replace apostrophe with unicode right quote
        text = text.replace(":", "\\:")
        text = text.replace(";", "\\;")
        text = text.replace("[", "\\[")
        text = text.replace("]", "\\]")
        text = text.replace("%", "%%")
        return text

    @staticmethod
    def _escape_path(path: str) -> str:
        """Escape file path for FFmpeg drawtext filter."""
        path = path.replace("\\", "/")
        path = path.replace(":", "\\:")
        return path

    @staticmethod
    def _resolve_content(block: TextBlock, tag_values: dict[str, str]) -> str:
        def replacer(match):
            tag_name = match.group(1)
            return tag_values.get(tag_name, match.group(0))

        return re.sub(r"\{(\w+)\}", replacer, block.content)

    def _get_font_path(self, block: TextBlock) -> str:
        """Font priority: user-selected override > per-block font > no font."""
        if self.default_font_path:
            return self.default_font_path
        if block.font_id and str(block.font_id) in self.font_paths:
            return self.font_paths[str(block.font_id)]
        return ""

    def _get_text_color(self, block: TextBlock) -> str:
        """Color priority: per-block override > universal override > block color > template default."""
        if self.text_color_override:
            # Check per-block override first
            block_color = self.text_color_override.get(str(block.id))
            if block_color:
                return block_color
            # Then universal override
            default_override = self.text_color_override.get("_default")
            if default_override:
                return default_override
        if block.text_color:
            return block.text_color
        return self.default_text_color

    def _build_drawtext_filter(self, block: TextBlock, text: str) -> str:
        x = int(block.position_x * self.width)
        y = int(block.position_y * self.height)
        font_size = int(block.font_size_ratio * self.height)
        start = block.start_time
        end = block.end_time
        duration = max(end - start, 0.001)

        escaped_text = self._escape_drawtext(text)
        font_path = self._get_font_path(block)
        text_color = self._get_text_color(block)

        # Build params as dict for easy override
        p = {}
        if font_path:
            p["fontfile"] = f"'{self._escape_path(font_path)}'"
        p["text"] = f"'{escaped_text}'"
        p["fontsize"] = str(font_size)
        p["fontcolor"] = text_color
        p["x"] = f"{x}-(text_w/2)" if block.text_align == "center" else str(x)
        p["y"] = str(y)
        p["enable"] = f"'between(t\\,{start}\\,{end})'"

        if block.animation_type == "fade_in":
            p["alpha"] = (
                f"'if(lt(t\\,{start})\\,0\\,"
                f"if(lt(t\\,{end})\\,"
                f"(t-{start})/{duration}\\,1))'"
            )

        elif block.animation_type == "slide_up":
            slide_distance = font_size * 2
            p["y"] = (
                f"if(lt(t\\,{start})\\,{y + slide_distance}\\,"
                f"if(lt(t\\,{end})\\,"
                f"{y + slide_distance}-{slide_distance}*(t-{start})/{duration}\\,"
                f"{y}))"
            )
            p["alpha"] = f"'if(lt(t\\,{start})\\,0\\,1)'"

        elif block.animation_type == "typewriter":
            p["alpha"] = f"'if(lt(t\\,{start})\\,0\\,1)'"

        elif block.animation_type == "scale_pop":
            scale_factor = 2.0
            p["fontsize"] = (
                f"'if(lt(t\\,{start})\\,0\\,"
                f"if(lt(t\\,{end})\\,"
                f"{font_size}*({scale_factor}-({scale_factor}-1)*(t-{start})/{duration})\\,"
                f"{font_size}))'"
            )
            p["alpha"] = f"'if(lt(t\\,{start})\\,0\\,1)'"

        return "drawtext=" + ":".join(f"{k}={v}" for k, v in p.items())

    def build_filter_complex(self) -> str:
        filters = []
        for block in self.text_blocks:
            text = self._resolve_content(block, self.tag_values)
            if not text:
                continue
            filters.append(self._build_drawtext_filter(block, text))

        return ",".join(filters) if filters else ""

    def render(self):
        filter_str = self.build_filter_complex()

        cmd = [
            "ffmpeg", "-y",
            "-i", self.source_path,
        ]

        if filter_str:
            cmd.extend(["-vf", filter_str])

        cmd.extend([
            "-c:v", "libx264",
            "-crf", "23",
            "-preset", "medium",
            "-c:a", "copy",
            self.output_path,
        ])

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr[-500:]}")
