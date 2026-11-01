"""
Measure how well the forensic engine separates real from edited/AI images.

Put known REAL photos in one folder and known EDITED or AI-GENERATED images in another,
then run from the project root:

    python scripts/calibrate.py --real path/to/real --fake path/to/fake

The script prints how often real images were wrongly flagged (false positives)
and how often fake images were caught (detection rate). Use these numbers,
not the engine's claims, to decide whether a threshold is usable.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from api.forensics import ForensicError, analyze_bytes  # noqa: E402

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def scores_for(folder):
    results, skipped = [], []
    for name in sorted(os.listdir(folder)):
        if os.path.splitext(name)[1].lower() not in IMAGE_EXTS:
            continue
        path = os.path.join(folder, name)
        try:
            with open(path, "rb") as fh:
                result = analyze_bytes(fh.read())
            signals = [(sig["label"], sig["value"], sig["score"]) for sig in result.signals]
            results.append((name, result.risk_score, result.verdict, signals))
        except ForensicError as exc:
            skipped.append((name, str(exc)))
    return results, skipped


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--real", required=True, help="folder of known genuine images")
    parser.add_argument("--fake", required=True, help="folder of known edited or AI images")
    parser.add_argument("--details", action="store_true",
                        help="print each check's score for every image")
    parser.add_argument("--threshold", type=float, default=51.0,
                        help="score at or above which an image counts as flagged (default 51 = Medium band)")
    args = parser.parse_args()

    real, real_skipped = scores_for(args.real)
    fake, fake_skipped = scores_for(args.fake)
    if not real or not fake:
        print("Need at least one readable image in both folders.")
        sys.exit(1)

    print(f"\nThreshold: score >= {args.threshold} counts as flagged\n")
    def show(rows, flag_word, ok_word):
        for name, score, verdict, signals in rows:
            mark = flag_word if score >= args.threshold else ok_word
            print(f"  {mark:8} {score:6.2f}  {name}  ({verdict})")
            if args.details:
                for label, value, sc in signals:
                    shown = "n/a" if sc < 0 else f"{sc:6.2f}"
                    print(f"             {shown:>7}  {label}: {value}")

    print("REAL images:")
    show(real, "FLAGGED", "ok")
    print("\nEDITED / AI images:")
    show(fake, "caught", "missed")

    false_pos = sum(1 for _, s, _, _ in real if s >= args.threshold)
    caught = sum(1 for _, s, _, _ in fake if s >= args.threshold)
    print("\nSUMMARY")
    print(f"  Real images wrongly flagged : {false_pos} / {len(real)}  ({100 * false_pos / len(real):.0f}%)")
    print(f"  Edited/AI images caught     : {caught} / {len(fake)}  ({100 * caught / len(fake):.0f}%)")
    if real_skipped or fake_skipped:
        print("\nSkipped (not readable):")
        for name, reason in real_skipped + fake_skipped:
            print(f"  {name}: {reason}")
    print("\nSmall samples give unreliable percentages. Aim for at least 50 images in each folder.")


if __name__ == "__main__":
    main()