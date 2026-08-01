import unittest

from packages.geospatial.agriscope_geospatial.quality import (
    AnalysisConfidence,
    QualityInput,
    evaluate_quality,
)


class QualityPolicyTests(unittest.TestCase):
    def test_valid_ratio_below_40_percent_is_not_analyzable(self):
        result = evaluate_quality(
            QualityInput(
                valid_pixel_ratio=0.39,
                cloud_pixel_ratio=0.5,
                shadow_pixel_ratio=0.05,
                no_data_ratio=0.06,
            )
        )
        self.assertFalse(result.display_analysis)
        self.assertEqual(result.analysis_confidence, AnalysisConfidence.NOT_ANALYZABLE)

    def test_valid_ratio_between_40_and_70_percent_is_low_confidence(self):
        result = evaluate_quality(
            QualityInput(
                valid_pixel_ratio=0.55,
                cloud_pixel_ratio=0.3,
                shadow_pixel_ratio=0.1,
                no_data_ratio=0.05,
            )
        )
        self.assertTrue(result.display_analysis)
        self.assertEqual(result.analysis_confidence, AnalysisConfidence.LOW)

    def test_valid_ratio_above_70_percent_is_high_confidence(self):
        result = evaluate_quality(
            QualityInput(
                valid_pixel_ratio=0.82,
                cloud_pixel_ratio=0.1,
                shadow_pixel_ratio=0.03,
                no_data_ratio=0.05,
            )
        )
        self.assertTrue(result.display_analysis)
        self.assertEqual(result.analysis_confidence, AnalysisConfidence.HIGH)

    def test_ratios_must_be_bounded(self):
        with self.assertRaises(ValueError):
            evaluate_quality(
                QualityInput(
                    valid_pixel_ratio=1.2,
                    cloud_pixel_ratio=0,
                    shadow_pixel_ratio=0,
                    no_data_ratio=0,
                )
            )


if __name__ == "__main__":
    unittest.main()
