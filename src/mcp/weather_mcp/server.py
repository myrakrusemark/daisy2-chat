#!/usr/bin/env python3
"""
Weather MCP Server - Provides weather data via MCP protocol
Default location: St. Louis, MO
Returns structured JSON data from NOAA API
"""

import sys
import json
import subprocess
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from mcp.server.fastmcp import FastMCP
import requests

DEFAULT_LOCATION = "St. Louis, MO"
DEFAULT_COORDS = (38.6270, -90.1994)

# Create MCP server
mcp = FastMCP("weather")


class WeatherService:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Weather MCP Server v1.0 (contact@example.com)'
        })

    def get_ip_geolocation(self) -> Optional[tuple]:
        """Get approximate location using IP geolocation"""
        try:
            response = self.session.get('https://ipapi.co/json/', timeout=10)
            response.raise_for_status()
            data = response.json()

            if 'latitude' in data and 'longitude' in data:
                lat = float(data['latitude'])
                lon = float(data['longitude'])
                return (lat, lon)

            return None
        except Exception:
            return None

    def get_gps_location(self) -> Optional[tuple]:
        """Get GPS location using termux-location API"""
        try:
            result = subprocess.run(['termux-location', '-p', 'gps', '-r', 'once'],
                                   capture_output=True, text=True, timeout=15)

            if result.returncode == 0 and result.stdout.strip():
                location_data = json.loads(result.stdout.strip())
                lat = location_data.get('latitude')
                lon = location_data.get('longitude')

                if lat is not None and lon is not None:
                    return (lat, lon)

            return None
        except Exception:
            return None

    def get_cell_tower_location(self) -> Optional[tuple]:
        """Get location using cellular towers"""
        try:
            result = subprocess.run(['termux-location', '-p', 'network', '-r', 'once'],
                                   capture_output=True, text=True, timeout=10)

            if result.returncode == 0 and result.stdout.strip():
                location_data = json.loads(result.stdout.strip())
                lat = location_data.get('latitude')
                lon = location_data.get('longitude')

                if lat is not None and lon is not None:
                    return (lat, lon)

            return None
        except Exception:
            return None

    def auto_detect_location(self) -> tuple:
        """Auto-detect location using GPS -> Cell -> IP hierarchy, fallback to St. Louis"""
        # Try GPS first (most accurate)
        coords = self.get_gps_location()
        if coords:
            return coords

        # Fallback to cell tower location
        coords = self.get_cell_tower_location()
        if coords:
            return coords

        # Final fallback to IP geolocation
        coords = self.get_ip_geolocation()
        if coords:
            return coords

        # Ultimate fallback: St. Louis, MO
        return DEFAULT_COORDS

    def geocode_location(self, location: Optional[str]) -> tuple:
        """Convert location string to coordinates"""
        # If no location provided or location is "auto", use auto-detection
        if not location or location.lower() in ['auto', 'current', 'here']:
            return self.auto_detect_location()

        # Check if location is already coordinates (lat,lon format)
        try:
            parts = location.split(',')
            if len(parts) == 2:
                lat = float(parts[0].strip())
                lon = float(parts[1].strip())
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    return (lat, lon)
        except (ValueError, AttributeError):
            pass

        # Built-in coordinates for major cities
        major_cities = {
            'st. louis, mo': (38.6270, -90.1994),
            'saint louis, mo': (38.6270, -90.1994),
            'denver, co': (39.7392, -104.9903),
            'chicago, il': (41.8781, -87.6298),
            'new york, ny': (40.7128, -74.0060),
            'los angeles, ca': (34.0522, -118.2437),
            'miami, fl': (25.7617, -80.1918),
            'seattle, wa': (47.6062, -122.3321),
            'phoenix, az': (33.4484, -112.0740),
            'dallas, tx': (32.7767, -96.7970),
            'philadelphia, pa': (39.9526, -75.1652),
            'houston, tx': (29.7604, -95.3698),
            'atlanta, ga': (33.4484, -84.3880),
            'boston, ma': (42.3601, -71.0589),
            'detroit, mi': (42.3314, -83.0458),
            'san francisco, ca': (37.7749, -122.4194),
            'las vegas, nv': (36.1699, -115.1398),
            'minneapolis, mn': (44.9778, -93.2650),
            'tampa, fl': (27.9506, -82.4572),
            'kansas city, mo': (39.0997, -94.5786)
        }

        location_lower = location.lower().strip()
        if location_lower in major_cities:
            return major_cities[location_lower]

        # Try OpenStreetMap Nominatim
        try:
            url = "https://nominatim.openstreetmap.org/search"
            params = {
                'q': f"{location}, USA",
                'format': 'json',
                'limit': 1,
                'countrycodes': 'us'
            }

            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()

            if data:
                return float(data[0]['lat']), float(data[0]['lon'])
        except Exception:
            pass

        # If all fails, return St. Louis
        return DEFAULT_COORDS

    def get_noaa_points(self, lat: float, lon: float) -> Dict[str, Any]:
        """Get NOAA grid points and forecast URLs"""
        url = f"https://api.weather.gov/points/{lat:.4f},{lon:.4f}"
        response = self.session.get(url, timeout=10)
        response.raise_for_status()

        data = response.json()
        properties = data['properties']

        return {
            'forecast_url': properties['forecast'],
            'forecast_hourly_url': properties['forecastHourly'],
            'grid_url': properties['forecastGridData'],
            'stations_url': properties['observationStations'],
            'grid_id': properties['gridId'],
            'grid_x': properties['gridX'],
            'grid_y': properties['gridY'],
            'office': properties['cwa'],
            'timezone': properties['timeZone']
        }

    def celsius_to_fahrenheit(self, celsius: Optional[float]) -> Optional[int]:
        if celsius is None:
            return None
        return round((celsius * 9/5) + 32)

    def kmh_to_mph(self, kmh: Optional[float]) -> Optional[int]:
        if kmh is None:
            return None
        return round(kmh * 0.621371)

    def pa_to_inhg(self, pascals: Optional[float]) -> Optional[float]:
        if pascals is None:
            return None
        return round(pascals * 0.000295301, 2)

    def m_to_miles(self, meters: Optional[float]) -> Optional[float]:
        if meters is None:
            return None
        return round(meters * 0.000621371, 1)

    def get_wind_direction_text(self, degrees: Optional[float]) -> str:
        if degrees is None:
            return "Unknown"

        directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                     "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        index = round(degrees / 22.5) % 16
        return directions[index]

    def get_current_conditions(self, stations_url: str) -> Optional[Dict[str, Any]]:
        """Get current weather conditions from nearest station"""
        try:
            # Get list of stations
            response = self.session.get(stations_url, timeout=10)
            response.raise_for_status()
            stations_data = response.json()

            # Try each station until we get current data
            for station in stations_data['features'][:5]:
                station_id = station['properties']['stationIdentifier']
                obs_url = f"https://api.weather.gov/stations/{station_id}/observations/latest"

                try:
                    obs_response = self.session.get(obs_url, timeout=5)
                    obs_response.raise_for_status()
                    obs_data = obs_response.json()

                    props = obs_data['properties']

                    # Check if we have temperature data
                    if props.get('temperature', {}).get('value') is not None:
                        return {
                            'station_name': station['properties'].get('name', 'Unknown'),
                            'temperature_c': props['temperature']['value'],
                            'temperature_f': self.celsius_to_fahrenheit(props['temperature']['value']),
                            'humidity': props.get('relativeHumidity', {}).get('value'),
                            'wind_speed_kmh': props.get('windSpeed', {}).get('value'),
                            'wind_speed_mph': self.kmh_to_mph(props.get('windSpeed', {}).get('value')),
                            'wind_direction_deg': props.get('windDirection', {}).get('value'),
                            'wind_direction': self.get_wind_direction_text(props.get('windDirection', {}).get('value')),
                            'pressure_pa': props.get('barometricPressure', {}).get('value'),
                            'pressure_inhg': self.pa_to_inhg(props.get('barometricPressure', {}).get('value')),
                            'visibility_m': props.get('visibility', {}).get('value'),
                            'visibility_mi': self.m_to_miles(props.get('visibility', {}).get('value')),
                            'conditions': props.get('textDescription', 'Unknown'),
                            'timestamp': props.get('timestamp')
                        }
                except Exception:
                    continue

            return None
        except Exception:
            return None

    def get_forecast_data(self, forecast_url: str, forecast_hourly_url: str) -> Dict[str, Any]:
        """Get daily and hourly forecast data"""
        # Daily forecast
        daily_response = self.session.get(forecast_url, timeout=10)
        daily_response.raise_for_status()
        daily_data = daily_response.json()

        # Hourly forecast
        hourly_response = self.session.get(forecast_hourly_url, timeout=10)
        hourly_response.raise_for_status()
        hourly_data = hourly_response.json()

        return {
            'daily': daily_data['properties']['periods'],
            'hourly': hourly_data['properties']['periods'][:24]  # Next 24 hours
        }

    def get_weather_alerts(self, lat: float, lon: float) -> list:
        """Get active weather alerts for the area"""
        try:
            alerts_url = f"https://api.weather.gov/alerts/active?point={lat},{lon}"
            response = self.session.get(alerts_url, timeout=10)
            response.raise_for_status()

            data = response.json()
            return data.get('features', [])
        except Exception:
            return []


# Initialize weather service
weather_service = WeatherService()


@mcp.tool()
def get_weather(location: str = None) -> str:
    """
    Get comprehensive weather data from NOAA API. Returns structured JSON with current conditions,
    hourly forecast (24 hours), daily forecast (7 days), and active weather alerts.
    Default location: St. Louis, MO. Supports auto-detection via GPS/cell/IP,
    or you can specify any US city/location.

    Args:
        location: Location to get weather for. Can be:
                 - 'auto' (auto-detect via GPS/cell/IP)
                 - city name (e.g., 'Chicago, IL')
                 - coordinates (e.g., '41.8781,-87.6298')
                 - None (defaults to St. Louis, MO)

    Returns:
        JSON string with weather data including location, current conditions, forecasts, and alerts
    """
    try:
        # Geocode location
        lat, lon = weather_service.geocode_location(location)

        # Get NOAA grid points
        grid_info = weather_service.get_noaa_points(lat, lon)

        # Get current conditions
        current = weather_service.get_current_conditions(grid_info['stations_url'])

        # Get forecast data
        forecasts = weather_service.get_forecast_data(
            grid_info['forecast_url'],
            grid_info['forecast_hourly_url']
        )

        # Get weather alerts
        alerts = weather_service.get_weather_alerts(lat, lon)

        # Format alerts for cleaner JSON
        formatted_alerts = []
        for alert in alerts[:5]:
            props = alert['properties']
            formatted_alerts.append({
                'event': props.get('event', 'Weather Alert'),
                'severity': props.get('severity', 'Unknown'),
                'headline': props.get('headline', ''),
                'description': props.get('description', ''),
                'instruction': props.get('instruction', ''),
                'onset': props.get('onset'),
                'expires': props.get('expires')
            })

        result = {
            'location': {
                'query': location or 'default (St. Louis, MO)',
                'latitude': lat,
                'longitude': lon,
                'grid_id': grid_info['grid_id'],
                'grid_x': grid_info['grid_x'],
                'grid_y': grid_info['grid_y'],
                'timezone': grid_info['timezone']
            },
            'current': current,
            'forecast': {
                'hourly': forecasts['hourly'],
                'daily': forecasts['daily']
            },
            'alerts': formatted_alerts,
            'metadata': {
                'source': 'National Weather Service',
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }
        }

        return json.dumps(result, indent=2)

    except Exception as e:
        error_result = {
            'error': str(e),
            'location': location or 'default (St. Louis, MO)',
            'message': 'Failed to retrieve weather data'
        }
        return json.dumps(error_result, indent=2)


if __name__ == "__main__":
    mcp.run()
