# Contributing to the dzbot map SDK

Issues and pull requests are welcome. Questions are also welcome on the
[dzbot Discord](https://discord.gg/Cg2kSMa6YM).

## Develop

You need Node.js 22 or newer.

```bash
npm install
npm run build            # map/dist and map-react/dist, including the script-tag bundle map/dist/dzmap.js
npm test
npm run typecheck
npm run lint
npm run check:packages   # after a build: package.json and the types resolve for every consumer (publint, attw)
```

CI runs all of these on every pull request.

A version raised in `map/package.json` or `map-react/package.json` is published to npm and tagged when it reaches
`main`.

## Pull requests

- Keep a pull request to one change and say in its description what it changes for someone embedding a map.
- `map/` stays free of frameworks; React-only code belongs in `map-react/`.
- Add or adjust a test under `map/test/` for behaviour you change.

## Sign-off (DCO)

Contributions are accepted under the [Developer Certificate of Origin 1.1](https://developercertificate.org/): by
signing off a commit you confirm that you wrote it or otherwise have the right to submit it under the project's
license. Sign off every commit with `git commit -s`. A check on every pull request looks for it.

## License

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE), like the rest of the
repository.
