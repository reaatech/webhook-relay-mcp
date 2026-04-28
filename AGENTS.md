# Agent Skills: webhook-relay-mcp

This directory contains agent skills for developing and maintaining the webhook-relay-mcp project. Each skill provides specialized capabilities for different aspects of the development workflow.

## Available Skills

### 🏗️ Architecture & Setup
- **`architecture-setup`**: Project initialization, dependency management, and core architecture setup
- **`database-design`**: SQLite schema design, migrations, and optimization

### 🔧 Development
- **`webhook-integration`**: Adding new webhook sources with signature validation and normalization
- **`mcp-tools`**: Implementing and testing MCP server tools

### 🛡️ Quality & Security
- **`security-hardening`**: Secret encryption, signature hardening, and input validation
- **`testing-strategy`**: Test structure, fixtures, mocking, and coverage targets

### 🚀 Deployment & Operations
- **`deployment-automation`**: Docker, CI/CD, and production deployment

## Usage

Each skill is contained in its own directory under `skills/` with a `skills.md` file that provides:
- Skill description and capabilities
- Required context and inputs
- Step-by-step implementation guidance
- Examples and best practices
- Related skills and dependencies

## GitHub Integration

All development follows the GitHub workflow:
- **Repository**: github.com/reaatech/webhook-relay-mcp
- **User**: reatech
- **Branch Strategy**: Feature branches → main
- **Code Review**: Required for all changes
- **CI/CD**: Automated testing and deployment

## Related Projects

- **media-pipeline-mcp** (github.com/reaatech/media-pipeline-mcp): Complementary MCP server for media processing pipelines

## Getting Started

1. Review the skill directories to understand available capabilities
2. Start with `architecture-setup` for initial project scaffolding
3. Use `database-design` for SQLite schema and repository setup
4. Use `webhook-integration` when adding new webhook sources
5. Use `mcp-tools` to implement agent-facing tools
6. Follow `testing-strategy` for comprehensive test coverage
7. Apply `security-hardening` before production deployment
8. Deploy using `deployment-automation` guidelines

## Contributing

When adding new skills:
1. Create a new directory under `skills/`
2. Follow the standard `skills.md` template
3. Document dependencies and related skills
4. Include examples and best practices
5. Update this index file

---

**Note**: These skills are designed to work with AI agents and development tools to accelerate webhook-relay-mcp development while maintaining enterprise-grade quality and security standards.
