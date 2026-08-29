package com.routeledger.dsa;

/**
 * Immutable WGS84 coordinate with a hand-rolled haversine metric.
 * Distances are returned in metres and are accurate to ~0.3% for city scale.
 */
public record GeoPoint(double lat, double lng) {

    private static final double EARTH_RADIUS_METRES = 6_371_008.8;

    public static double haversineMetres(GeoPoint a, GeoPoint b) {
        double lat1 = Math.toRadians(a.lat());
        double lat2 = Math.toRadians(b.lat());
        double dLat = lat2 - lat1;
        double dLng = Math.toRadians(b.lng() - a.lng());

        double sinLat = Math.sin(dLat / 2.0);
        double sinLng = Math.sin(dLng / 2.0);
        double h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
        double c = 2.0 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0.0, 1.0 - h)));
        return EARTH_RADIUS_METRES * c;
    }

    public double distanceTo(GeoPoint other) {
        return haversineMetres(this, other);
    }
}
