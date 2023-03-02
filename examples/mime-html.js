'use strict';

const mimeHtml = require('../lib/mime-html');
const fs = require('fs');

const type = process.argv[3] || 'html';
const file = fs.readFileSync(process.argv[2]);

const HTML_TEMPLATE = `<html>
<head>
<meta charset="utf-8">
<title>test email</title>

<style>

body {
    background: white;
}

.body-container {
    max-width: 840px;
    margin: 30px auto;
    padding: 20px;
    background: #fafafa;
}

.email-container {
    padding: 20px;
    border: 1px solid #ccc;
    background: white;
}

</style>

<head>
<body>

<div class="body-container">

<h1>Email message</h1>

<div class="email-container">
HTML_BODY
</div>

<p>Footer text</p>

</div>

</body>
</html>`;

console.log(HTML_TEMPLATE.replace(/HTML_BODY/g, mimeHtml({ [type]: file })));
