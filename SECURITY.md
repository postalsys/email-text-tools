# Security Policy

`@postalsys/email-text-tools` converts and sanitizes email content for display -
turning plain text into HTML, HTML into plain text, and sanitizing/CSS-inlining
arbitrary (and often untrusted) email HTML into markup that is safe to render.
Because it processes attacker-controlled input and its output is shown to end
users, we take security reports seriously and aim to respond quickly.

## Supported Versions

Security fixes are released only against the latest version. We do not backport
patches to older releases - upgrading to the current release line is the
supported way to receive security updates.

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

If you are on an older version, please upgrade. See the release notes at
<https://github.com/postalsys/email-text-tools/releases> before updating.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues,
pull requests, or discussions.**

Report privately through one of the following channels:

1. **GitHub Security Advisories (preferred).** Open a private report at
   <https://github.com/postalsys/email-text-tools/security/advisories/new>. This
   keeps the discussion private until a fix is published and lets us credit you.
2. **Email.** Send details to **andris@postalsys.com**. Encrypt sensitive details
   if possible.

When reporting, please include as much of the following as you can:

- The affected version(s) and environment (package version, Node.js version, OS).
- The function involved (`mimeHtml`, `textToHtml`, `htmlToText`, `inlineHtml`,
  `inlineText`).
- A clear description of the issue and its impact (e.g. XSS / sanitizer bypass,
  denial of service via catastrophic regex backtracking or CSS that hangs
  processing, prototype pollution, content or information disclosure).
- A minimal proof of concept: the input that triggers it and the unsafe output
  or behavior it produces.
- Any suggested remediation, if you have one.

We are a small team, so there is no guaranteed response time - sometimes reports
are handled within hours, sometimes they take longer. Accepted issues are fixed
in a new release and coordinated through a GitHub Security Advisory, and
reporters who wish to be named are credited.

## CVEs

We track and disclose vulnerabilities through GitHub Security Advisories. We do
not request or manage CVE identifiers ourselves. If you need a CVE assigned for a
reported issue, please request one yourself - for example, through GitHub's own
CVE request flow on the published advisory, or another CNA.

## Scope

In scope: the library source in this repository - in particular:

- Sanitizer bypasses in `mimeHtml` that let active content (scripts, event
  handler attributes, dangerous URL schemes, or other executable markup) survive
  into the sanitized output.
- Denial of service in any conversion path - input that causes catastrophic
  regex backtracking or makes CSS inlining hang or exhaust resources.
- Prototype pollution or similar object-integrity issues reachable through the
  public API.

Out of scope:

- Vulnerabilities in your own application that consumes this library - for
  example, rendering the output without a Content Security Policy, or trusting
  the output in a non-HTML context.
- Issues in third-party dependencies that are already publicly known; report
  those upstream (we will still pick up the dependency fix in a release).
- Missing security hardening without a demonstrated, concrete impact.

Thank you for helping keep email-text-tools and its users safe.
