# osu! mapping utility

osu! mapping utility is a lightweight desktop tool designed to assist with auxiliary tasks surrounding osu! beatmap creation.
It provides a streamlined environment for operations such as duplicating beatmapsets, editing metadata, and obtaining external audio sources — tasks typically performed outside the official editor.

> [!NOTE]
> This tool is not intended to replace the official editor.
> Its primary goal is to support the mapping workflow by simplifying peripheral tasks.

> [!IMPORTANT]
> This tool was developed for personal use and is shared primarily with acquaintances.  
> Support may be limited or unavailable.  
> The accuracy of the information provided by this tool is not guaranteed.  
> Please verify all information yourself before relying on it.

## Download

The latest stable builds can be found here:
[github.com/namakemono-san/osu-mapping-utility/releases/latest](https://github.com/namakemono-san/osu-mapping-utility/releases/latest)

## Development

To build from source, use the following commands:

```
git clone https://github.com/namakemono-san/osu-mapping-utility.git
cd osu-mapping-utility

pnpm install

# Development build
pnpm dev

# Production build
pnpm build
```

## Features

### Map Tools

| Category                     | Description                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Beatmap Clone**            | Generates a working copy of an existing beatmapset. Copies timing points, resets difficulty settings, and strips unnecessary skin files.                           |
| **Beatmap Preview**          | Plays back taiko beatmaps with a visual playfield and audio synchronization. Supports hit sounds, SV/tick visualization, DT/HR mods, and per-difficulty toggling.  |
| **Beatmap Customizer**       | Applies batch text-level modifications to `.osu` files, such as removing editor bookmarks, rewriting combo colors, and converting hitsound types.                  |
| **Metadata Editor**          | Edits metadata fields including Unicode/Romanized title, artist, creator, source, and tags across all difficulties. Renames `.osu` files automatically.            |
| **Ranking Criteria Checker** | Validates a beatmapset against osu! Ranking Criteria rules and guidelines across categories: metadata, audio quality, file usage, spread, and difficulty settings. |

### Utilities

| Category              | Description                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Offset Calibrator** | Allows offset adjustment by playing audio directly within the application.                                    |
| **Audio Analyzer**    | Analyzes audio files for BPM, bitrate, and frequency cutoff. Generates and exports a spectrogram image.       |
| **Video Downloader**  | Downloads video or audio from external sources such as YouTube via yt-dlp for use during beatmap preparation. |
| **Image Downloader**  | Downloads thumbnail images from YouTube for use as a beatmap background.                                      |

## Roadmap

| Category                       | Summary                                 | Status           |
| ------------------------------ | --------------------------------------- | ---------------- |
| **Plugin / Extension Support** | Support for external utility extensions | 🟡 Concept stage |

## Issue Reporting

Bug reports and feature requests can be submitted via [GitHub Issues](https://github.com/namakemono-san/osu-mapping-utility/issues)

## License

This project is released under the **MIT License**.
See the [LICENSE](./LICENSE) file for details.
