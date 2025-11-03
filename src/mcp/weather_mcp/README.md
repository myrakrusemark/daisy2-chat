# Weather MCP Server

An MCP (Model Context Protocol) server that provides comprehensive weather data from the NOAA API in structured JSON format.

## Features

- **Current Conditions**: Temperature, humidity, wind, pressure, visibility, and more
- **Hourly Forecast**: Next 24 hours of detailed weather predictions
- **Daily Forecast**: 7-day forecast with high/low temperatures and conditions
- **Weather Alerts**: Active watches, warnings, and advisories
- **Smart Location Detection**: Auto-detects location via GPS → Cell towers → IP address
- **Default Location**: St. Louis, MO (38.6270, -90.1994)

## Installation

1. Install dependencies:
```bash
pip install mcp requests
```

2. Make the server executable:
```bash
chmod +x server.py
```

## Usage

### As an MCP Server

Add to your MCP client configuration (e.g., Claude Desktop config):

```json
{
  "mcpServers": {
    "weather": {
      "command": "python",
      "args": ["/home/myra/cassistant/src/mcp/weather_mcp/server.py"]
    }
  }
}
```

### Tool: `get_weather`

Get comprehensive weather data for any US location.

**Parameters:**
- `location` (optional): Location to get weather for
  - `"auto"` - Auto-detect via GPS/cell/IP
  - City name - e.g., `"Chicago, IL"`
  - Coordinates - e.g., `"41.8781,-87.6298"`
  - If not specified, defaults to St. Louis, MO

**Returns:** JSON object with:
- `location`: Query location and coordinates
- `current`: Current weather conditions
- `forecast.hourly`: Next 24 hours
- `forecast.daily`: 7-day forecast
- `alerts`: Active weather alerts
- `metadata`: Source and timestamp

**Example Queries:**
```
Get weather for default location (St. Louis)
Get weather for Chicago, IL
Get weather for my current location (auto)
Get weather for coordinates 40.7128,-74.0060
```

## Location Detection Methods

The server uses a fallback hierarchy for location detection:

1. **GPS** - Most accurate (requires termux-location on Android)
2. **Cell Towers** - Network-based location (requires termux-location)
3. **IP Geolocation** - Uses ipapi.co for approximate location
4. **Default** - St. Louis, MO if all detection methods fail

## Data Source

Weather data is provided by the National Weather Service (NOAA) API:
- High-quality, free, no API key required
- US locations only
- Updated regularly from official weather stations

## Output Format

All data is returned as structured JSON without ASCII art or decorative elements, making it ideal for programmatic consumption by AI assistants and other applications.

## Major Cities Supported

The server includes built-in coordinates for major US cities:
- St. Louis, MO (default)
- Chicago, IL
- New York, NY
- Los Angeles, CA
- San Francisco, CA
- Seattle, WA
- Miami, FL
- Denver, CO
- And many more...

For unlisted cities, the server will use OpenStreetMap Nominatim for geocoding.
