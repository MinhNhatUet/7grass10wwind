from pathlib import Path

import pytest

from src.ingestion.course_registry import CourseRegistry, CourseRegistryError

FIXTURE_ROOT = Path("test_artifacts/ingestion_course_registry")


def _fixture_path(name: str) -> Path:
    FIXTURE_ROOT.mkdir(parents=True, exist_ok=True)
    return FIXTURE_ROOT / name


def test_resolve_known_folder():
    path = _fixture_path("courses_known.yaml")
    path.write_text(
        """
courses:
  calculus:
    course_id: MATH101
    course_code: MATH101
    course_name: Calculus I
""",
        encoding="utf-8",
    )

    registry = CourseRegistry.load(path)

    assert registry.resolve_folder("calculus").id == "MATH101"


def test_unknown_folder_fails():
    path = _fixture_path("courses_empty.yaml")
    path.write_text("courses: {}\n", encoding="utf-8")

    registry = CourseRegistry.load(path)

    with pytest.raises(CourseRegistryError):
        registry.resolve_folder("unknown")


def test_duplicate_course_id_fails():
    path = _fixture_path("courses_duplicate.yaml")
    path.write_text(
        """
courses:
  a:
    course_id: C1
    course_code: C1
    course_name: A
  b:
    course_id: C1
    course_code: C1
    course_name: B
""",
        encoding="utf-8",
    )

    with pytest.raises(CourseRegistryError):
        CourseRegistry.load(path)
