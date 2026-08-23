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

    def test_approximate_thailand_service_bounds_are_inclusive(self):
        geometry = {
            "type": "Polygon",
            "coordinates": [
                [
                    [97.34, 5.61],
                    [105.64, 5.61],
                    [105.64, 20.47],
                    [97.34, 20.47],
                    [97.34, 5.61],
                ]
            ],
        }
        self.assertEqual(validate_field_polygon(geometry).geometry, geometry)

    def test_positions_outside_approximate_thailand_service_bounds_are_rejected(self):
        outside_positions = {
            "west": [97.3399, 13.0],
            "east": [105.6401, 13.0],
            "south": [100.0, 5.6099],
            "north": [100.0, 20.4701],
        }
        for side, outside in outside_positions.items():
            geometry = {
                "type": "Polygon",
                "coordinates": [
                    [outside, [100.01, 13.0], [100.01, 13.01], [100.0, 13.01], outside]
                ],
            }
            with self.subTest(side=side), self.assertRaisesRegex(ValueError, "Thailand"):
                validate_field_polygon(geometry)

    def test_rai_conversion(self):
        self.assertEqual(sqm_to_rai(1600), 1.0)
        self.assertEqual(sqm_to_rai(4000), 2.5)


if __name__ == "__main__":
    unittest.main()
