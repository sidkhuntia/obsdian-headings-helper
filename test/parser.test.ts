import { MarkdownParser } from '../parser';
import { HeadingLevel } from '../types';

describe('MarkdownParser', () => {
    describe('parseLine', () => {
        test('should parse regular paragraph text', () => {
            const result = MarkdownParser.parseLine('This is a paragraph');
            expect(result).toEqual({
                indent: '',
                listMarker: '',
                headingMarker: '',
                content: 'This is a paragraph',
                level: HeadingLevel.Paragraph
            });
        });

        test('should parse H1 heading', () => {
            const result = MarkdownParser.parseLine('# This is H1');
            expect(result).toEqual({
                indent: '',
                listMarker: '',
                headingMarker: '#',
                content: 'This is H1',
                level: HeadingLevel.H1
            });
        });

        test('should parse H6 heading', () => {
            const result = MarkdownParser.parseLine('###### This is H6');
            expect(result).toEqual({
                indent: '',
                listMarker: '',
                headingMarker: '######',
                content: 'This is H6',
                level: HeadingLevel.H6
            });
        });

        test('should parse indented heading', () => {
            const result = MarkdownParser.parseLine('  ## Indented H2');
            expect(result).toEqual({
                indent: '  ',
                listMarker: '',
                headingMarker: '##',
                content: 'Indented H2',
                level: HeadingLevel.H2
            });
        });

        test('should parse list item with heading', () => {
            const result = MarkdownParser.parseLine('- ### List item heading');
            expect(result).toEqual({
                indent: '',
                listMarker: '- ',
                headingMarker: '###',
                content: 'List item heading',
                level: HeadingLevel.H3
            });
        });

        test('should parse indented list item with heading', () => {
            const result = MarkdownParser.parseLine('  * #### Indented list heading');
            expect(result).toEqual({
                indent: '  ',
                listMarker: '* ',
                headingMarker: '####',
                content: 'Indented list heading',
                level: HeadingLevel.H4
            });
        });

        test('should handle empty lines', () => {
            const result = MarkdownParser.parseLine('');
            expect(result).toEqual({
                indent: '',
                listMarker: '',
                headingMarker: '',
                content: '',
                level: HeadingLevel.Paragraph
            });
        });

        test('should handle whitespace-only lines', () => {
            const result = MarkdownParser.parseLine('   ');
            expect(result).toEqual({
                indent: '   ',
                listMarker: '',
                headingMarker: '',
                content: '',
                level: HeadingLevel.Paragraph
            });
        });

        test('should cap heading level at H6', () => {
            const result = MarkdownParser.parseLine('######### Too many hashes');
            expect(result.level).toBe(HeadingLevel.H6);
        });
    });

    describe('lineToText', () => {
        test('should convert parsed line back to text', () => {
            const parsed = {
                indent: '  ',
                listMarker: '- ',
                headingMarker: '##',
                content: 'Test heading',
                level: HeadingLevel.H2
            };
            const result = MarkdownParser.lineToText(parsed, HeadingLevel.H3);
            expect(result).toBe('  - ### Test heading');
        });

        test('should handle paragraph conversion', () => {
            const parsed = {
                indent: '',
                listMarker: '',
                headingMarker: '##',
                content: 'Heading to paragraph',
                level: HeadingLevel.H2
            };
            const result = MarkdownParser.lineToText(parsed, HeadingLevel.Paragraph);
            expect(result).toBe('Heading to paragraph');
        });

        test('should preserve indentation and list markers', () => {
            const parsed = {
                indent: '    ',
                listMarker: '* ',
                headingMarker: '',
                content: 'List item',
                level: HeadingLevel.Paragraph
            };
            const result = MarkdownParser.lineToText(parsed, HeadingLevel.H1);
            expect(result).toBe('    * # List item');
        });
    });

    describe('cycleHeading', () => {
        test('should not cycle paragraphs - paragraph stays paragraph', () => {
            expect(MarkdownParser.cycleHeading(HeadingLevel.Paragraph, 'cycle')).toBe(HeadingLevel.Paragraph);
            expect(MarkdownParser.cycleHeading(HeadingLevel.Paragraph, 'up')).toBe(HeadingLevel.Paragraph);
            expect(MarkdownParser.cycleHeading(HeadingLevel.Paragraph, 'down')).toBe(HeadingLevel.Paragraph);
        });

        test('should cycle from H1 to H2', () => {
            const result = MarkdownParser.cycleHeading(HeadingLevel.H1, 'cycle');
            expect(result).toBe(HeadingLevel.H2);
        });

        test('should cycle from H6 to paragraph when wrapping enabled', () => {
            const result = MarkdownParser.cycleHeading(HeadingLevel.H6, 'cycle', true);
            expect(result).toBe(HeadingLevel.Paragraph);
        });

        test('should stay at H6 when wrapping disabled', () => {
            const result = MarkdownParser.cycleHeading(HeadingLevel.H6, 'cycle', false);
            expect(result).toBe(HeadingLevel.H6);
        });

        test('should go up from H2 to H1', () => {
            const result = MarkdownParser.cycleHeading(HeadingLevel.H2, 'up');
            expect(result).toBe(HeadingLevel.H1);
        });

        test('should stay at H1 when going up (no wrapping to paragraph)', () => {
            const result = MarkdownParser.cycleHeading(HeadingLevel.H1, 'up', true);
            expect(result).toBe(HeadingLevel.H1);
        });

        test('should go down from H1 to H2', () => {
            const result = MarkdownParser.cycleHeading(HeadingLevel.H1, 'down');
            expect(result).toBe(HeadingLevel.H2);
        });

        test('should go down from H6 to paragraph when wrapping enabled', () => {
            const result = MarkdownParser.cycleHeading(HeadingLevel.H6, 'down', true);
            expect(result).toBe(HeadingLevel.Paragraph);
        });
    });

    describe('getHeadingDisplayText', () => {
        test('should return ¶ for paragraph', () => {
            expect(MarkdownParser.getHeadingDisplayText(HeadingLevel.Paragraph)).toBe('¶');
        });

        test('should return H1-H6 for headings', () => {
            expect(MarkdownParser.getHeadingDisplayText(HeadingLevel.H1)).toBe('H1');
            expect(MarkdownParser.getHeadingDisplayText(HeadingLevel.H2)).toBe('H2');
            expect(MarkdownParser.getHeadingDisplayText(HeadingLevel.H3)).toBe('H3');
            expect(MarkdownParser.getHeadingDisplayText(HeadingLevel.H4)).toBe('H4');
            expect(MarkdownParser.getHeadingDisplayText(HeadingLevel.H5)).toBe('H5');
            expect(MarkdownParser.getHeadingDisplayText(HeadingLevel.H6)).toBe('H6');
        });
    });

    describe('getHeadingTooltip', () => {
        test('should return appropriate tooltip for paragraph', () => {
            expect(MarkdownParser.getHeadingTooltip(HeadingLevel.Paragraph))
                .toBe('Paragraph – click to change');
        });

        test('should return appropriate tooltip for headings', () => {
            expect(MarkdownParser.getHeadingTooltip(HeadingLevel.H1))
                .toBe('Heading 1 – click to change');
            expect(MarkdownParser.getHeadingTooltip(HeadingLevel.H3))
                .toBe('Heading 3 – click to change');
        });
    });
});