from __future__ import annotations

import unittest

from app.services.crawl_job_runs import extract_token_usage


class CrawlJobRunTokenUsageTests(unittest.TestCase):
    def test_extracts_cached_tokens_from_usage_metadata(self) -> None:
        usage = extract_token_usage(
            {
                "raw": {
                    "message": (
                        "usage_metadata={'input_tokens': 100, 'output_tokens': 20, "
                        "'total_tokens': 120, 'input_token_details': {'cache_read': 64}}"
                    )
                }
            }
        )

        self.assertIsNotNone(usage)
        self.assertEqual(usage["input_tokens"], 100)
        self.assertEqual(usage["output_tokens"], 20)
        self.assertEqual(usage["total_tokens"], 120)
        self.assertEqual(usage["cached_tokens"], 64)

    def test_extracts_cached_tokens_from_response_metadata(self) -> None:
        usage = extract_token_usage(
            {
                "raw": {
                    "message": (
                        "response_metadata={'token_usage': {'completion_tokens': 12, "
                        "'prompt_tokens': 34, 'total_tokens': 46, "
                        "'prompt_tokens_details': {'cached_tokens': 16}}}"
                    )
                }
            }
        )

        self.assertIsNotNone(usage)
        self.assertEqual(usage["input_tokens"], 34)
        self.assertEqual(usage["output_tokens"], 12)
        self.assertEqual(usage["total_tokens"], 46)
        self.assertEqual(usage["cached_tokens"], 16)


if __name__ == "__main__":
    unittest.main()
