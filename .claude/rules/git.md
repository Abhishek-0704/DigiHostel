# Git Rules

Before significant work:
`git status`

After work:
`git status`
`git diff`

Preserve unrelated user changes.

Never run destructive commands such as `git reset --hard` or broad cleanup without explicit authorization.

Never commit:
- `.env` files containing secrets
- API keys
- service-role/secret keys
- database credentials
- private certificates

Do not rewrite history or force-push without explicit instruction.
