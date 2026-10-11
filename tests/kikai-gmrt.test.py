"""Synthetic tests of diagnostics only; do not verify external GMRT data."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('kikai', Path(__file__).resolve().parents[1] / 'tools/investigate-kikai-gmrt.py')
kikai = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kikai)


class Diagnostics(unittest.TestCase):
    def test_pixel_centres_and_linear_interpolation(self):
        grid = dict(values=np.array([[0., 2., 4.], [10., 12., 14.], [20., 22., 24.]]),
                    lon0=129., lat0=29., dx=.1, dy=-.1)
        result = kikai.sample(grid, np.array([129., 129.05, 128.9]), np.array([29., 28.95, 29.]))
        np.testing.assert_allclose(result[:2], [0., 6.])
        self.assertTrue(np.isnan(result[2]))
        grid['values'][1, 1] = np.nan
        self.assertTrue(np.isnan(kikai.sample(grid, np.array([129.05]), np.array([28.95]))[0]))

    def test_residuals_exclude_missing_and_land(self):
        r = kikai.difference(np.array([-10., -20., np.nan, 5.]),
                             np.array([-12., -18., 0., 0.]), np.array([True, True, True, False]))
        self.assertEqual(r['count'], 2)
        self.assertEqual(r['biasMeters'], 0)
        self.assertEqual(r['rmseMeters'], 2)

    def test_existing_source_integrity(self):
        grid, meta = kikai.baseline()
        self.assertEqual(grid['values'].shape, (511, 798))
        self.assertAlmostEqual(meta['actualSpacingMeters'][0], 876.701, places=2)
        self.assertEqual(meta['quantizationMeters'], 1)


if __name__ == '__main__':
    unittest.main()
