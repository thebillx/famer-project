import math
import unittest

from packages.geospatial.agriscope_geospatial.remote_sensing.indices import (
    bare_soil_index,
    evi,
    nbr,
    ndmi,
    ndre,
    ndvi,
    ndwi,
    safe_ratio,
    savi,
)


class RemoteSensingIndexTests(unittest.TestCase):
    def test_safe_ratio_returns_zero_for_zero_denominator(self):
        self.assertEqual(safe_ratio(1.0, 0.0), 0.0)

    def test_safe_ratio_rejects_nan(self):
        with self.assertRaises(ValueError):
            safe_ratio(math.nan, 1.0)

    def test_ndvi(self):
        self.assertAlmostEqual(ndvi(0.72, 0.18), 0.6)

    def test_evi(self):
        self.assertAlmostEqual(evi(0.72, 0.18, 0.08), 0.6136363636363636)

    def test_savi(self):
        self.assertAlmostEqual(savi(0.72, 0.18), 0.5785714285714285)

    def test_ndmi(self):
        self.assertAlmostEqual(ndmi(0.72, 0.32), 0.3846153846153846)

    def test_ndwi(self):
        self.assertAlmostEqual(ndwi(0.21, 0.72), -0.5483870967741935)

    def test_ndre(self):
        self.assertAlmostEqual(ndre(0.68, 0.31), 0.37373737373737376)

    def test_nbr(self):
        self.assertAlmostEqual(nbr(0.72, 0.22), 0.5319148936170213)

    def test_bare_soil_index(self):
        self.assertAlmostEqual(bare_soil_index(0.32, 0.18, 0.72, 0.08), -0.23076923076923078)


if __name__ == "__main__":
    unittest.main()
