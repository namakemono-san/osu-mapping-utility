# osu! mapping utility

osu! mapping utility is a lightweight desktop tool designed to assist with auxiliary tasks surrounding osu! beatmap creation.
It provides a streamlined environment for operations such as duplicating beatmapsets, editing metadata, and obtaining external audio sources — tasks typically performed outside the official editor.

> [!NOTE]
> This tool is not intended to replace the official editor.
> Its primary goal is to support the mapping workflow by simplifying peripheral tasks.

## Download

The latest stable builds can be found here:
[https://github.com/your-org/osu-mapping-utility/releases/latest](https://github.com/your-org/osu-mapping-utility/releases/latest)

## Development

To build from source, use the following commands:

```
git clone https://github.com/your-org/osu-mapping-utility.git
cd osu-mapping-utility

yarn install

# Development build (desktop)
yarn tauri dev

# Production build
yarn tauri build
```

## Features

| Category              | Description                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Beatmap Clone**     | Generates a safe working copy of an existing beatmapset for testing or editing purposes.                              |
| **Beatmap Preview**   | Lists beatmapsets within the Songs directory and displays metadata such as title, artist, and difficulty information. |
| **Metadata Editor**   | Edits metadata fields including Unicode/Romanized titles, Artist, Source, and Tags.                                   |
| **Offset Calibrator** | Allows offset adjustment by playing the audio directly within the application.                                        |
| **Downloader**        | Retrieves audio from external sources such as YouTube or SoundCloud for use during beatmap preparation.               |

## Roadmap

| Category                       | Summary                                                       | Status                 |
| ------------------------------ | ------------------------------------------------------------- | ---------------------- |
| **.osu Difficulty Viewer**     | Visualization of hitobjects and timing elements on a timeline | 🔴 Not started         |
| **Batch Metadata Fixer**       | Apply metadata corrections across multiple difficulties       | 🔴 Not started         |
| **Beatmap Comparison Tools**   | Compare differences between diffs, versions, or revisions     | 🔴 Not started         |
| **Plugin / Extension Support** | Support for external utility extensions                       | 🟡 Concept stage       |
| **Preset Mapping Utilities**   | Quick-access presets for commonly used preprocessing tasks    | 🟡 Concept stage       |

## Issue Reporting

Bug reports and feature requests can be submitted via GitHub Issues:
[https://github.com/your-org/osu-mapping-utility/issues](https://github.com/your-org/osu-mapping-utility/issues)

## License

This project is released under the **MIT License**.
See the [LICENSE](./LICENSE) file for details.
