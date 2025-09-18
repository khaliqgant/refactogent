# Security Policy

## Supported Versions

RefactoAgent is currently in active development. Security updates will be provided for:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability in RefactoAgent, please report it responsibly.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report security vulnerabilities by emailing: security@khaliqgant.com

Include the following information:
- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5 business days
- **Regular Updates**: We will keep you informed of our progress throughout the investigation
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Security Considerations for RefactoAgent

RefactoAgent operates on source code and has several security considerations:

#### Code Execution
- RefactoAgent executes build and test commands from project configurations
- Always review `.refactor-agent.yaml` configurations before use
- Use containerized environments when possible

#### File System Access
- RefactoAgent reads and writes source code files
- Ensure proper file permissions and access controls
- Be cautious with protected or sensitive directories

#### GitHub Integration
- GitHub App permissions are minimized to required scopes
- Webhook signatures are verified
- Tokens are handled securely and never logged

#### Local Development
- CLI operations are performed in the current working directory
- Be aware of the scope of operations when running commands
- Review generated patches before applying them

### Best Practices for Users

1. **Review Configurations**: Always review `.refactor-agent.yaml` files
2. **Use Version Control**: Ensure all changes are tracked in git
3. **Test in Isolation**: Use separate branches for refactoring operations
4. **Validate Changes**: Review all generated changes before merging
5. **Keep Updated**: Use the latest version of RefactoAgent
6. **Secure Credentials**: Protect GitHub tokens and other credentials

### Scope

This security policy applies to:
- RefactoAgent CLI tool
- VS Code extension
- GitHub App integration
- Configuration files and templates
- Documentation and examples

### Out of Scope

The following are generally not considered security vulnerabilities:
- Issues in third-party dependencies (report to the respective projects)
- Social engineering attacks
- Physical access to development machines
- Issues requiring physical access to the system

### Recognition

We appreciate security researchers who help keep RefactoAgent safe. With your permission, we will:
- Acknowledge your contribution in our security advisories
- Include you in our hall of fame (if you wish)
- Provide updates on the fix and release timeline

Thank you for helping keep RefactoAgent and our community safe!