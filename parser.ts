import { HeadingLevel, ParsedLine } from './types';

export class MarkdownParser {
    // Regex to match: optional whitespace, optional list marker, optional heading markers
    private static readonly LINE_PATTERN = /^(\s*)([-*+]\s+)?(?:(#+)(?=\s))?\s*(.*?)$/;

    /**
     * Parse a line to extract its components
     */
    static parseLine(text: string): ParsedLine {
        const match = text.match(this.LINE_PATTERN);

        if (!match) {
            return {
                indent: '',
                listMarker: '',
                headingMarker: '',
                content: text,
                level: HeadingLevel.Paragraph
            };
        }

        if (match[3] && match[3].length > 6) {
            return {
                indent: '',
                listMarker: '',
                headingMarker: '',
                content: text,
                level: HeadingLevel.Paragraph
            };
        }
        const [, indent = '', listMarker = '', headingMarker = '', content = ''] = match;
        const level = headingMarker ? headingMarker.length as HeadingLevel : HeadingLevel.Paragraph;

        return {
            indent,
            listMarker,
            headingMarker,
            content: content.trim(),
            level
        };
    }

    /**
     * Convert a parsed line back to text with new heading level
     */
    static lineToText(parsed: ParsedLine, newLevel: HeadingLevel): string {
        const headingMarker = newLevel === HeadingLevel.Paragraph ? '' : '#'.repeat(newLevel) + ' ';
        return `${parsed.indent}${parsed.listMarker}${headingMarker}${parsed.content}`;
    }

    /**
     * Cycle heading level according to rules - only works with headings
     */
    static cycleHeading(currentLevel: HeadingLevel, direction: 'up' | 'down' | 'cycle', wrapAfterH6 = true): HeadingLevel {
        // Don't cycle paragraphs unless it's a demotion from H6
        if (currentLevel === HeadingLevel.Paragraph) {
            return HeadingLevel.Paragraph;
        }

        switch (direction) {
            case 'up': // Promote (decrease level number)
                if (currentLevel === HeadingLevel.H1) {
                    return HeadingLevel.H1; // Stay at H1, don't go to paragraph
                } else {
                    return (currentLevel - 1) as HeadingLevel;
                }

            case 'down': // Demote (increase level number)
                if (currentLevel === HeadingLevel.H6) {
                    return wrapAfterH6 ? HeadingLevel.Paragraph : HeadingLevel.H6;
                } else {
                    return (currentLevel + 1) as HeadingLevel;
                }

            case 'cycle':
                if (currentLevel === HeadingLevel.H6) {
                    return wrapAfterH6 ? HeadingLevel.Paragraph : HeadingLevel.H6;
                } else {
                    return (currentLevel + 1) as HeadingLevel;
                }

            default:
                return currentLevel;
        }
    }

    /**
     * Get display text for heading level
     */
    static getHeadingDisplayText(level: HeadingLevel): string {
        return level !== HeadingLevel.Paragraph ? `H${level}` : '';
    }

    /**
     * Get tooltip text for heading level
     */
    static getHeadingTooltip(level: HeadingLevel): string {
        return level === HeadingLevel.Paragraph ? 'Paragraph – click to change' : `Heading ${level} – click to change`;
    }
} 