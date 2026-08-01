import unittest

from packages.geospatial.agriscope_geospatial.safe_language import (
    is_allowed_phrase,
    is_prohibited_phrase,
)


class SafeLanguageTests(unittest.TestCase):
    def test_allowed_phrase(self):
        self.assertTrue(is_allowed_phrase("พบค่าความเขียวลดลง"))

    def test_prohibited_phrase(self):
        self.assertTrue(is_prohibited_phrase("แปลงนี้เป็นโรคแน่นอน"))

    def test_neutral_phrase_not_prohibited(self):
        self.assertFalse(is_prohibited_phrase("ควรตรวจสอบภาคสนาม"))


if __name__ == "__main__":
    unittest.main()
