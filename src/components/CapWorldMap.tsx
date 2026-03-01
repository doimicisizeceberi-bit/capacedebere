"use client";

import { useEffect, useRef, useState } from "react";
import type L from "leaflet";

export default function CapWorldMap() {
  const mapRef = useRef<L.Map | null>(null);
  const selectedLayerRef = useRef<any>(null);

  const [geoData, setGeoData] = useState<any>(null);
  const [LeafletComponents, setLeafletComponents] = useState<any>(null);

  const capsByIso3: Record<string, number> = {
    ROU: 120,
    DEU: 55,
    USA: 12,
  };

  function getColor(count: number) {
    if (!count) return "#efefef";
    if (count < 10) return "#bfdbfe";
    if (count < 50) return "#60a5fa";
    return "#2563eb";
  }

  useEffect(() => {
    async function load() {
      const leaflet = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      const reactLeaflet = await import("react-leaflet");

      setLeafletComponents({
        L: leaflet.default,
        MapContainer: reactLeaflet.MapContainer,
        GeoJSON: reactLeaflet.GeoJSON,
      });

      const res = await fetch("/world.geojson");
      const data = await res.json();
      setGeoData(data);
    }

    load();
  }, []);

  if (!LeafletComponents || !geoData) {
    return <div style={{ padding: 20 }}>Loading map...</div>;
  }

  const { MapContainer, GeoJSON } = LeafletComponents;

  function onEachCountry(feature: any, layer: any) {
    const iso3 = feature.properties?.["ISO3166-1-Alpha-3"];
    const count = capsByIso3[iso3] ?? 0;

    const defaultStyle = {
      fillColor: getColor(count),
      fillOpacity: 0.8,
      color: "#9ca3af",
      weight: 1,
    };

    layer.setStyle(defaultStyle);

    layer.bindTooltip(
      `<strong>${feature.properties.name}</strong><br/>Caps: ${count}`,
      { sticky: true }
    );

    layer.on("click", () => {
      const map = mapRef.current;
      if (!map) return;

      // If clicking same country → reset
      if (selectedLayerRef.current === layer) {
        selectedLayerRef.current.setStyle(
          selectedLayerRef.current._defaultStyle
        );
        selectedLayerRef.current = null;
        map.setView([20, 0], 2);
        return;
      }

      // Reset previous selection
      if (selectedLayerRef.current) {
        selectedLayerRef.current.setStyle(
          selectedLayerRef.current._defaultStyle
        );
      }

      // Store default style for this layer
      layer._defaultStyle = defaultStyle;

      // Apply red highlight
      layer.setStyle({
        fillColor: "#dc2626",
        fillOpacity: 0.9,
        color: "#7f1d1d",
        weight: 1.5,
      });

      selectedLayerRef.current = layer;

      const bounds = layer.getBounds();
      map.fitBounds(bounds);
    });
  }

  return (
    <div style={{ height: "600px", width: "100%" }}>
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
        whenCreated={(map: L.Map) => (mapRef.current = map)}
      >
        <GeoJSON
          data={geoData}
          onEachFeature={onEachCountry}
        />
      </MapContainer>
    </div>
  );
}