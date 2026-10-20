# @dzbot/map

Interactive DayZ maps for any website — Chernarus, Livonia, Sakhal and Nasdara — with markers, zones, routes,
GeoJSON, a ruler with sprint time, search and your own layers. Free, no API key.

```bash
npm install @dzbot/map
```

```ts
import { DzMap } from '@dzbot/map'

const map = new DzMap('#map', { map: 'chernarus', zoom: 'cover', placeNames: true, controls: { zoom: true, ruler: true } })
map.addPin([6900, 2700], { label: 'Our base' })
map.on('click', (e) => console.log(e.world)) // [x, z] in world metres
```

Or without a build step:

```html
<div data-dzmap="chernarus" data-place-names style="height: 450px"></div>
<script src="https://map.dzbot.de/sdk/v1/dzmap.js"></script>
```

Documentation, live examples and the embed builder: **https://developers.dzbot.de**

The code is MIT licensed. The map tiles and place names it loads from dzbot.de are free to use under the
[map terms](https://developers.dzbot.de/terms.html): keep the `© dzbot.de` credit visible, don't bulk-download or
re-host them. DayZ is a trademark of Bohemia Interactive a.s.; dzbot is not affiliated with Bohemia Interactive.
