# Deployment Reference

SDD deployment stack:
- GitHub: source control
- Supabase PostgreSQL: backend database
- Supabase Realtime
- Vercel: frontend hosting/deployment
- Environment variables: secrets
- Application logs/metrics: monitoring

Environments:
Development
Staging
Production

Pipeline:
Developer push → GitHub → automated build/tests → Vercel → Supabase connection → health checks → production release.

Branches specified by the SDD:
main, develop, feature/*, hotfix/*, release/*.

Never commit secrets. Production changes require verification and rollback awareness.
