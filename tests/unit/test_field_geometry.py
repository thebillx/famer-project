import unittest

from packages.geospatial.agriscope_geospatial.field_geometry import sqm_to_rai, validate_field_polygon


VALID_POLYGON = {
    "type": "Polygon",
    "coordinates": [
        [
            [98.9801, 18.7901],
            [98.9811, 18.7901],
            [98.9811, 18.7911],
            [98.9801, 18.7911],
            [98.9801, 18.7901],
        ]
    ],
}


class FieldGeometryTests(unittest.TestCase):
    def test_valid_polygon_is_accepted(self):
        result = validate_field_polygon(VALID_POLYGON)
        self.assertEqual(result.geometry["type"], "Polygon")

    def test_open_ring_is_rejected(self):
        geometry = {
            "type": "Polygon",
            "coordinates": [[[98.0, 18.0], [99.0, 18.0], [99.0, 19.0], [98.0, 19.0]]],
        }
        with self.assertRaisesRegex(ValueError, "closed"):
            validate_field_polygon(geometry)

    def test_self_intersection_is_rejected(self):
        geometry = {
            "type": "Polygon",
            "coordinates": [
                [[98.0, 18.0], [99.0, 19.0], [98.0, 19.0], [99.0, 18.0], [98.0, 18.0]]
            ],
        }
        with self.assertRaisesRegex(ValueError, "self-intersect"):
            validate_field_polygon(geometry)

    def test_rai_conversion(self):
        self.assertEqual(sqm_to_rai(1600), 1.0)
        self.assertEqual(sqm_to_rai(4000), 2.5)


if __name__ == "__main__":
    unittest.main()
