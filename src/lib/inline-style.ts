// The default <style> block mimeHtml() prepends when a message has only a text body, so quoted
// text converted by textToHtml() gets its quote colouring. A leaf module, so the package entry can
// export it without loading jsdom. Named export only: lib/ modules with a default export are
// rewritten to return it from require().

/** Base styles mimeHtml() applies to a message that only has a plain text body */
export const INLINE_STYLE_BLOCK = `<style>

body, td, th, p {
    font-family: sans-serif;
    font-size: 12px;
}

blockquote {
    border-left-width: 2px;
    border-left-style: solid;
    
    border-left-color: darkblue;
    color: darkblue;

    margin: 1rem 0;
    padding-left: 1rem;
}

blockquote blockquote{
    border-left-color: royalblue;
    color: royalblue;
}

blockquote blockquote blockquote{
    border-left-color: dodgerblue;
    color: dodgerblue;
}

blockquote blockquote blockquote blockquote{
    border-left-color: darkblue;
    color: darkblue;
}

</style>`;
