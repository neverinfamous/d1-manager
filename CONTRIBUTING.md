# Contributing to D1 Database Manager

Thank you for your interest in contributing to D1 Database Manager! We welcome contributions from the community and are grateful for your support.

## 🤝 How to Contribute

### Reporting Bugs

If you find a bug, please create an issue using the Bug Report template. Include:

- A clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Your environment (OS, browser, Node.js version)
- Screenshots if applicable
- Any relevant error messages or logs

### Suggesting Features

We love feature requests! Please create an issue using the Feature Request template. Include:

- A clear, descriptive title
- The problem your feature would solve
- Your proposed solution
- Alternative solutions you've considered
- Any additional context or screenshots

### Pull Requests

We actively welcome pull requests! Here's how to contribute code:

1. **Fork the repository** and create your branch from `master`
2. **Make your changes** following our coding standards
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Ensure the build passes** (`npm run build`)
6. **Submit a pull request** using our template

## 🏗️ Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git
- (Optional) Cloudflare account for testing with real D1 databases

### Getting Started

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/d1-manager.git
cd d1-manager

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Start development server
npm run dev

# In a separate terminal, start the Worker
cd worker
npm install
npm run dev
```

The app will be available at `http://localhost:5173` with the Worker API at `http://localhost:8787`.

## 📋 Coding Standards

### TypeScript

- Use TypeScript for all new code
- Avoid `any` types - use proper typing
- Follow existing patterns in the codebase
- Run `npm run lint` before committing

### React Components

- Use functional components with hooks
- Keep components focused and single-purpose
- Extract reusable logic into custom hooks
- Use TypeScript interfaces for props

### Styling

- Use Tailwind CSS utility classes
- Follow existing design patterns
- Use shadcn/ui components when available
- Maintain responsive design

### Git Commits

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
feat: add new database search feature
fix: resolve pagination bug in table viewer
docs: update API documentation
style: format code with prettier
refactor: simplify query builder logic
test: add tests for migration wizard
chore: update dependencies
```

## 🧪 Testing

### Local Development Testing

The Worker provides mock data for local testing:

```bash
npm run dev  # Frontend
cd worker && npm run dev  # Worker API
```

Test all major features:

- Database listing
- Table browsing
- Query execution
- Schema design
- Migration wizard

### Production Testing (Optional)

If you have a Cloudflare account:

```bash
# Deploy to your account
npx wrangler deploy

# Test with real D1 databases
```

## 📚 Project Structure

```
d1-manager/
├── src/                    # Frontend React app
│   ├── components/         # React components
│   │   ├── ui/            # shadcn/ui components
│   │   └── ...            # Feature components
│   ├── contexts/          # React contexts
│   ├── hooks/             # Custom hooks
│   ├── lib/               # Utilities
│   └── types/             # TypeScript types
├── worker/                # Cloudflare Worker backend
│   ├── src/               # Worker source
│   └── schema.sql         # Metadata database schema
├── .github/               # GitHub templates
└── docs/                  # Documentation
```

## 🔍 Review Process

1. **Initial Review**: Maintainers review PRs within 3-5 days
2. **Feedback**: We may request changes or clarifications
3. **Testing**: PRs must pass all checks
4. **Approval**: Requires approval from at least one maintainer
5. **Merge**: Maintainers will merge approved PRs

## 🎯 Good First Issues

Look for issues labeled `good first issue` - these are great for newcomers!

## 🌟 Recognition

Contributors are recognized in:

- GitHub's automatic contributors list
- Release notes for significant contributions
- Our gratitude and appreciation!

## 📞 Getting Help

- **Questions?** Open a Discussion
- **Stuck?** Comment on your PR or issue
- **Need clarification?** Ask in the relevant issue

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Thank You

Every contribution, no matter how small, makes D1 Database Manager better for everyone. Thank you for being part of our community!

---

**Made with ❤️ for the Cloudflare community**
