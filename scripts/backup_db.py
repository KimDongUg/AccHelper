"""SQLite database backup utility.

Creates timestamped copies of the database file and keeps the last N backups.

Usage:
    python scripts/backup_db.py
    python scripts/backup_db.py --db data/acchelper.db --dest data/backups --keep 30
"""

import argparse
import shutil
from datetime import datetime
from pathlib import Path


def backup(db_path: Path, dest_dir: Path, keep: int):
    if not db_path.exists():
        print(f"Database not found: {db_path}")
        return

    dest_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"{db_path.stem}_{timestamp}{db_path.suffix}"
    backup_path = dest_dir / backup_name

    shutil.copy2(db_path, backup_path)
    print(f"Backup created: {backup_path}")

    backups = sorted(dest_dir.glob(f"{db_path.stem}_*{db_path.suffix}"))
    if len(backups) > keep:
        for old in backups[: len(backups) - keep]:
            old.unlink()
            print(f"Removed old backup: {old.name}")

    print(f"Total backups: {len(list(dest_dir.glob(f'{db_path.stem}_*{db_path.suffix}')))}")


def main():
    base_dir = Path(__file__).resolve().parent.parent

    parser = argparse.ArgumentParser(description="Backup AccHelper SQLite database")
    parser.add_argument("--db", default=str(base_dir / "data" / "acchelper.db"), help="Path to database file")
    parser.add_argument("--dest", default=str(base_dir / "data" / "backups"), help="Backup destination directory")
    parser.add_argument("--keep", type=int, default=30, help="Number of backups to keep")

    args = parser.parse_args()
    backup(Path(args.db), Path(args.dest), args.keep)


if __name__ == "__main__":
    main()
