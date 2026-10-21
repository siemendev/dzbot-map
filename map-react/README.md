# @dzbot/map-react

React bindings for [@dzbot/map](https://www.npmjs.com/package/@dzbot/map).

```bash
npm install @dzbot/map @dzbot/map-react
```

```tsx
import { DzMapView, useDzMap, useMapEvent } from '@dzbot/map-react'

function Clicks() {
  const map = useDzMap()
  useMapEvent(map, 'click', (e) => console.log(e.world))
  return null
}

export function Map() {
  return (
    <DzMapView map="livonia" zoom="cover" placeNames controls={{ zoom: true, ruler: true }} style={{ height: 450 }}>
      <Clicks />
    </DzMapView>
  )
}
```

Documentation: **https://developers.dzbot.de/map/reference#react**
