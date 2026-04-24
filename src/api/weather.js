import { getWeatherData } from "./weatherService.js";

export async function fetchWeather(icao) {
    return getWeatherData(icao);
}
