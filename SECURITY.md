# Security Policy

## Supported Versions

We release patches for security vulnerabilities. Currently supported versions:

| Version  | Supported          |
| -------- | ------------------ |
| Latest   | :white_check_mark: |
| < Latest | :x:                |

We recommend always using the latest version of D1 Database Manager.

## Reporting a Vulnerability

We take the security of D1 Database Manager seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### Where to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via:

1. **GitHub Security Advisories** (Preferred)
   - Go to the [Security tab](https://github.com/neverinfamous/d1-manager/security/advisories)
   - Click "Report a vulnerability"
   - Fill out the form with details

2. **Direct Contact**
   - Create a private issue with the `security` label
   - We will respond within 48 hours

### What to Include

Please include as much information as possible:

- Type of vulnerability
- Full paths of source file(s) related to the vulnerability
- Location of the affected source code (tag/branch/commit or direct URL)
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the vulnerability
- Your suggestions for fixing it (if any)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 5 business days
- **Fix Timeline**: Depends on severity and complexity

### Security Update Process

1. **Validation**: We'll confirm the vulnerability
2. **Fix Development**: We'll work on a patch
3. **Testing**: Thorough testing of the fix
4. **Disclosure**:
   - We'll coordinate disclosure with you
   - Security advisory published
   - Release with fix deployed
5. **Credit**: We'll credit you in the security advisory (if desired)

## Security Best Practices

When deploying D1 Database Manager:

### Authentication

- **Always use Cloudflare Access (Zero Trust)** in production
- Configure appropriate identity providers (GitHub OAuth, etc.)
- Set restrictive access policies
- Never disable authentication checks

### API Security

- **Protect API tokens**: Never commit tokens to version control
- Use Cloudflare Workers Secrets for sensitive data
- Set proper CORS policies
- Implement rate limiting if needed

### Database Access

- Grant minimal D1 permissions needed
- Use separate API tokens for different environments
- Rotate API tokens regularly
- Audit database access logs

### Environment Configuration

- Use `.env` files for local development only
- Never expose Worker secrets
- Keep dependencies up to date
- Review Cloudflare Access logs regularly

### Worker Security

```bash
# Set all secrets (never hardcode)
npx wrangler secret put ACCOUNT_ID
npx wrangler secret put API_KEY
npx wrangler secret put TEAM_DOMAIN
npx wrangler secret put POLICY_AUD
```

### Network Security

- Use HTTPS only (enforced by Cloudflare Workers)
- Configure appropriate CSP headers
- Enable Cloudflare's security features
- Monitor for suspicious activity

## Known Security Considerations

### Local Development Mode

- Mock data mode bypasses authentication for `localhost`
- **Never deploy** with `VITE_WORKER_API=http://localhost:8787`
- Ensure environment is properly configured for production

### API Token Permissions

- Worker requires **D1 Edit** permission
- Avoid using Global API Key (use scoped API tokens)
- Review token access logs in Cloudflare dashboard

### Data Exposure

- Be cautious with sensitive data in databases
- Use Cloudflare Access policies to restrict users
- Consider additional encryption for sensitive fields
- Review query history for potential data leaks

## Security Features

D1 Database Manager implements several security features:

- **Cloudflare Access Integration**: Enterprise-grade authentication
- **JWT Validation**: Every API request validated
- **Scoped Permissions**: Minimal required access
- **Audit Logging**: Query history tracking
- **Secure Defaults**: Production-ready configuration
- **Input Validation**: SQL injection prevention
- **Rate Limiting**: Via Cloudflare Workers platform

## Compliance

This project follows:

- OWASP Top 10 security guidelines
- Cloudflare security best practices
- Zero Trust security model
- Principle of least privilege

## Addressed Vulnerabilities

### CVE-2025-64756: glob CLI Command Injection (December 2025)

**Status**: ✅ Mitigated (Proactive Fix)

**Severity**: High

**Description**: The `glob` npm package (versions 10.2.0-10.4.x and 11.0.0-11.0.3) contained a command injection vulnerability in its CLI's `-c/--cmd` option. Malicious filenames with shell metacharacters could execute arbitrary commands when processed.

**Impact on D1 Manager**:

- D1 Manager does not directly use the glob CLI
- No current dependencies use vulnerable glob versions
- Risk was theoretical/future-facing

**Mitigation**:

- Added `"glob": "^11.1.0"` to `package.json` overrides section
- Forces all dependencies (current and future) to use patched version 11.1.0
- Provides defense-in-depth protection against transitive dependencies

**References**:

- [GitHub Advisory GHSA-xj72-wvfv-8985](https://github.com/advisories/GHSA-xj72-wvfv-8985)
- [CVE-2025-64756](https://nvd.nist.gov/vuln/detail/CVE-2025-64756)

**Verification**:

```bash
# Verify no vulnerable glob versions in dependency tree
npm ls glob --all
```

### CVE-2025-60876: BusyBox wget CRLF Injection (January 2026)

**Status**: ⏳ Awaiting Alpine Patch

**Severity**: Medium (6.5)

**Description**: CRLF Injection vulnerability in BusyBox's `wget` utility (versions through 1.37.0). Attackers can inject arbitrary HTTP headers by including control characters in the request path/query.

**Impact on D1 Manager**:

- **Not exploitable** - D1 Manager uses `curl` for health checks, not `wget`
- BusyBox is included in Alpine Linux base image but `wget` is not used
- Risk is theoretical only for this application

**Mitigation**:

- Waiting for Alpine Linux to release patched busybox (1.37.0-r31+)
- CVE was published 6 days ago; Alpine typically patches within 1-2 weeks
- Docker builds will automatically pick up the fix when available

**Why not switch base images?**

- Switching to Debian Slim would increase image size from ~150MB to ~250MB+
- Distroless would require significant refactoring and lose debugging capabilities
- The vulnerable component (`wget`) is not used by this application

**References**:

- [CVE-2025-60876](https://nvd.nist.gov/vuln/detail/CVE-2025-60876)
- [Alpine Security Tracker](https://security.alpinelinux.org/)

### CVE-2026-22184: zlib Buffer Overflow in untgz (January 2026)

**Status**: ⏳ Awaiting zlib 1.3.1.3 (NOT EXPLOITABLE)

**Severity**: Critical (9.3)

**Description**: Global buffer overflow vulnerability in zlib's `untgz` utility (versions up to 1.3.1-r2). The `TGZfname()` function uses an unbounded `strcpy()` call to copy an attacker-supplied archive name, which can lead to memory corruption, denial of service, and potentially arbitrary code execution if the supplied name exceeds 1024 bytes.

**Impact on D1 Manager**:

- **Not exploitable** - D1 Manager does not use the `untgz` utility
- The vulnerable code path is only triggered when processing tar/gzip archives via the `untgz` command-line tool
- D1 Manager uses `curl` for HTTP operations and Node.js built-in modules for archive handling
- Risk is theoretical only for this application

**Mitigation**:

- Fixed version (zlib 1.3.1.3) not yet packaged by any Linux distribution (CVE published Jan 7, 2026)
- Alpine edge repository does not yet have a patched version
- Dockerfile documents this as "NOT EXPLOITABLE" with monitoring note
- Docker builds will automatically pick up the fix when Alpine releases the patch

**Why not switch base images?**

- Debian bookworm uses older zlib 1.2.13 which may not be affected, but switching would increase image size from ~150MB to ~250MB+
- The vulnerable component (`untgz`) is not used by this application
- Will upgrade zlib from Alpine edge repository once 1.3.1.3 is packaged

**References**:

- [CVE-2026-22184](https://nvd.nist.gov/vuln/detail/CVE-2026-22184)
- [GitHub Advisory](https://github.com/advisories/GHSA-zlib-untgz-overflow)
- [Alpine Security Tracker](https://security.alpinelinux.org/)

---

## Security Updates

Security updates are released as soon as possible after validation. Subscribe to:

- GitHub Security Advisories
- GitHub Releases (security releases are tagged)
- GitHub Watch notifications

## Questions?

If you have questions about security that aren't covered here:

- Open a Discussion (for general security questions)
- Check Cloudflare's security documentation
- Review the CONTRIBUTING.md file

## Acknowledgments

We appreciate the security research community and will acknowledge researchers who responsibly disclose vulnerabilities (with permission).

---

**Security is a shared responsibility. Thank you for helping keep D1 Database Manager secure!**
