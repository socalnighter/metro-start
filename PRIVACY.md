# Privacy

Metro Start has no account, no server of its own, no analytics and no tracking.

## What stays on your computer

Your tiles, folders, settings, uploaded pictures, chosen wallpaper and game progress are stored in your Chrome profile (`chrome.storage.local`). They never leave your computer unless you export a backup yourself.

## What is sent to other services

Metro Start talks directly to these services, and only for the features you use:

| Feature | Service | What it sends |
| --- | --- | --- |
| Weather | Open-Meteo | Your approximate coordinates, or the city you chose |
| Weather (city name) | BigDataCloud | Your coordinates; without them, the service estimates your location from your internet connection |
| City search | Open-Meteo geocoding | The city name you type |
| News widget | Google News, or your own feed | A request for the headlines feed |
| News feed tiles | The news sites you add | A request for each site's feed (and, when you add a site by its address, its home page to find the feed). Story pictures load from the news sites |
| More weather places | Open-Meteo | The coordinates of the cities you add |
| Markets widget | Yahoo Finance | The stock symbols you chose |
| Wallpaper gallery | Wikimedia Commons | Requests for the gallery list and the pictures you view or pick |
| Site icons | Google's favicon service | The website addresses of your tiles |
| Bookmark import (sharp icons) | The websites you import | A normal page request to each site, without your cookies |

Like any web request, these services can see your IP address. No request includes your name, email, browsing history or bookmarks.

## Permissions

The bookmarks permission and site access for imports and widgets are optional. Chrome asks for them only when you use those features, and site access for icon fetching is given back as soon as the import finishes. You can review or remove permissions at any time in `chrome://extensions`.
