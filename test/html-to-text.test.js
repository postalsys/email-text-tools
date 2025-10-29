'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const htmlToText = require('../lib/html-to-text');

describe('html-to-text conversion', () => {
    it('should preserve newlines from br tags', () => {
        const html = 'Line 1<br>Line 2<br>Line 3';
        const text = htmlToText(html);

        assert.ok(text.includes('Line 1'));
        assert.ok(text.includes('Line 2'));
        assert.ok(text.includes('Line 3'));

        // Check that lines are separated
        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.equal(lines.length, 3);
    });

    it('should preserve newlines from div tags', () => {
        const html = '<div>Line 1</div><div>Line 2</div><div>Line 3</div>';
        const text = htmlToText(html);

        assert.ok(text.includes('Line 1'));
        assert.ok(text.includes('Line 2'));
        assert.ok(text.includes('Line 3'));

        // Check that lines are separated
        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.equal(lines.length, 3);
    });

    it('should preserve newlines from paragraph tags', () => {
        const html = '<p>Paragraph 1</p><p>Paragraph 2</p><p>Paragraph 3</p>';
        const text = htmlToText(html);

        assert.ok(text.includes('Paragraph 1'));
        assert.ok(text.includes('Paragraph 2'));
        assert.ok(text.includes('Paragraph 3'));

        // Check that paragraphs are separated
        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.equal(lines.length, 3);
    });

    it('should handle MS Graph style HTML with mixed formatting', () => {
        // Typical MS Graph HTML structure
        const html = `
            <div>Hello there,</div>
            <div><br></div>
            <div>This is a test email with multiple lines.</div>
            <div>Each line should be preserved.</div>
            <div><br></div>
            <div>Thanks,</div>
            <div>User</div>
        `;
        const text = htmlToText(html);

        assert.ok(text.includes('Hello there'));
        assert.ok(text.includes('This is a test email'));
        assert.ok(text.includes('Each line should be preserved'));
        assert.ok(text.includes('Thanks'));
        assert.ok(text.includes('User'));

        // Verify structure is maintained
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        assert.ok(lines.length >= 5, `Expected at least 5 lines, got ${lines.length}`);
    });

    it('should handle lists with proper line breaks', () => {
        const html = '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
        const text = htmlToText(html);

        assert.ok(text.includes('Item 1'));
        assert.ok(text.includes('Item 2'));
        assert.ok(text.includes('Item 3'));

        // Each list item should be on a new line
        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.ok(lines.length >= 3);
    });

    it('should handle headers with appropriate spacing', () => {
        const html = '<h1>Main Title</h1><p>Some content</p><h2>Subtitle</h2><p>More content</p>';
        const text = htmlToText(html);

        assert.ok(text.includes('Main Title'));
        assert.ok(text.includes('Some content'));
        assert.ok(text.includes('Subtitle'));
        assert.ok(text.includes('More content'));

        // Headers should create separation
        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.ok(lines.length >= 4);
    });

    it('should handle blockquotes with line breaks', () => {
        const html = '<p>Normal text</p><blockquote>Quoted text line 1<br>Quoted text line 2</blockquote><p>More normal text</p>';
        const text = htmlToText(html);

        assert.ok(text.includes('Normal text'));
        assert.ok(text.includes('Quoted text line 1'));
        assert.ok(text.includes('Quoted text line 2'));
        assert.ok(text.includes('More normal text'));
    });

    it('should not create excessive blank lines', () => {
        const html = '<p>Text 1</p><p>Text 2</p><p>Text 3</p>';
        const text = htmlToText(html);

        // Should not have more than 3 consecutive newlines
        assert.ok(!text.includes('\n\n\n\n'), 'Should not have 4 or more consecutive newlines');
    });

    it('should handle tables with line breaks between rows', () => {
        const html = '<table><tr><td>Cell 1</td><td>Cell 2</td></tr><tr><td>Cell 3</td><td>Cell 4</td></tr></table>';
        const text = htmlToText(html);

        assert.ok(text.includes('Cell 1'));
        assert.ok(text.includes('Cell 2'));
        assert.ok(text.includes('Cell 3'));
        assert.ok(text.includes('Cell 4'));

        // Rows should be separated
        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.ok(lines.length >= 2);
    });

    it('should handle empty elements gracefully', () => {
        const html = '<div>Text</div><div></div><div>More text</div>';
        const text = htmlToText(html);

        assert.ok(text.includes('Text'));
        assert.ok(text.includes('More text'));
    });

    it('should preserve newlines in pre tags', () => {
        const html = '<pre>Line 1\nLine 2\nLine 3</pre>';
        const text = htmlToText(html);

        assert.ok(text.includes('Line 1'));
        assert.ok(text.includes('Line 2'));
        assert.ok(text.includes('Line 3'));
    });

    it('should handle complex nested structure', () => {
        const html = `
            <div>
                <p>First paragraph</p>
                <div>
                    <div>Nested content</div>
                </div>
                <p>Last paragraph</p>
            </div>
        `;
        const text = htmlToText(html);

        assert.ok(text.includes('First paragraph'));
        assert.ok(text.includes('Nested content'));
        assert.ok(text.includes('Last paragraph'));

        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.equal(lines.length, 3);
    });

    it('should handle real-world MS Graph HTML example', () => {
        // Real example of how MS Graph might return HTML
        const html = `
            <html>
            <head></head>
            <body>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            Hi Team,</div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            <br>
            </div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            I wanted to update you on the following:</div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            <br>
            </div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            - Item 1</div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            - Item 2</div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            - Item 3</div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            <br>
            </div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            Best regards,</div>
            <div style="font-family:Calibri,Arial,Helvetica,sans-serif; font-size:12pt; color:rgb(0,0,0)">
            John</div>
            </body>
            </html>
        `;
        const text = htmlToText(html);

        // Check all content is present
        assert.ok(text.includes('Hi Team'));
        assert.ok(text.includes('I wanted to update you'));
        assert.ok(text.includes('- Item 1'));
        assert.ok(text.includes('- Item 2'));
        assert.ok(text.includes('- Item 3'));
        assert.ok(text.includes('Best regards'));
        assert.ok(text.includes('John'));

        // Check structure is preserved
        const lines = text.trim().split('\n').filter(l => l.trim());
        assert.ok(lines.length >= 7, `Expected at least 7 content lines, got ${lines.length}`);

        // Items should be on separate lines
        const itemIndex1 = text.indexOf('- Item 1');
        const itemIndex2 = text.indexOf('- Item 2');
        const itemIndex3 = text.indexOf('- Item 3');

        assert.ok(itemIndex2 > itemIndex1);
        assert.ok(itemIndex3 > itemIndex2);

        // There should be newlines between items
        assert.ok(text.substring(itemIndex1, itemIndex2).includes('\n'));
        assert.ok(text.substring(itemIndex2, itemIndex3).includes('\n'));
    });
});
