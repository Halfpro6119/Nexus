# Nexus Google Maps lead task

## Import the official task

1. Double-click `Nexus-Google-Maps-Octoparse-Task.url`.
2. Sign in to Octoparse if prompted.
3. Select **Save to Octoparse** to add the official Google Maps demo scraper to the desktop app.
4. Duplicate the imported task and rename the copy `nexus-google-maps-lead-discovery`.

## Make it reusable

Keep the starting URL as a batch URL input. Nexus will create URLs in this form for every niche and location:

```text
https://www.google.com/maps/search/{NICHE}+in+{LOCATION}
```

The example URL is only for task design and does not restrict later searches:

```text
https://www.google.com/maps/search/businesses+in+Leeds+UK
```

## Required workflow

```text
Batch URL input
└── Partial-scroll results loop
    └── Variable-list business loop
        ├── Click business
        └── Extract data
```

- Partial-scroll XPath: `//a[@class="hfpxzc"]/../../..`
- Business-list XPath: `//a[@class="hfpxzc"]`
- Scroll repeats: `100`
- Scroll wait: `1 second`
- Click AJAX timeout: `7 seconds`
- Extract wait: `3 seconds`

## Nexus output fields

Rename the extracted fields exactly as follows:

| Field | XPath / source |
| --- | --- |
| `business_name` | `//div[contains(@class,'fontHeadlineSmall')]` |
| `address` | `//button[@data-item-id="address"]//div/div[2]` |
| `phone` | `//button[contains(@data-item-id,'phone')]//div/div[last()]` |
| `website_url` | Website element URL attribute from `//a[@data-item-id="authority"]` |
| `google_place_id` | Page URL, or the page URL itself if a separate Place ID cannot be extracted |

Run the task locally with one URL, confirm that it returns multiple businesses, then upload the duplicated task to Octoparse Cloud and run it there once.

Finally, copy its Octoparse **Task ID (API)** for the Nexus integration.
