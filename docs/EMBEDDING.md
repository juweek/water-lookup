# Embedding

Every lookup is a route, so an iframe can point directly at a result such as
`/Detroit`, `/48226`, `/flint`, or `/distilled`.

```html
<iframe
  src="https://YOUR-DEPLOYMENT.vercel.app/Detroit"
  title="Drinking-water record lookup"
  width="100%"
  loading="lazy"
></iframe>
```

The app posts its content height to the parent through
`src/lib/embedHeight.js`. For a subpath deployment:

```sh
VITE_BASE=/tools/water/ npm run build
```
