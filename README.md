# mosques.world

Mosques from around the world.

A community web app for finding mosques and prayer spaces, with iqamah times and amenities kept accurate by the
community, and public profiles (`mosques.world/@username`) that map every mosque you have prayed in.

Built with [vinext](https://github.com/cloudflare/vinext) (the Next.js App Router API on Vite) and deployed as a
single Cloudflare Worker with D1, R2, KV, Queues and Email Service.

## Quick start

```sh
pnpm install
pnpm db:migrate:local
pnpm dev          # http://127.0.0.1:5173
```

## Docs

- [Contributing](CONTRIBUTING.md)
- [Testing and verifying changes](docs/testing.md) (`pnpm verify`, `pnpm e2e`, signed-in screenshots with `pnpm shot`)
- [Deployment and environments](docs/deployment.md)
- [Implementation spec](docs/spec/README.md) and [runbooks](docs/runbooks)
- [Design](design/README.md) · [live canvas](https://claude.ai/artifact/C5AduujXjZbCEDLdvjVgmr)
- [Security policy](SECURITY.md)

Map data © OpenStreetMap contributors (ODbL). See [/attribution](https://mosques.world/attribution).

## License

[AGPL-3.0](LICENSE). If you run a modified version as a service, you must publish its source.
