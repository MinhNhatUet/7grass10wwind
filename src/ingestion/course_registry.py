from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, Field, ValidationError


class CourseRegistryError(ValueError):
    """Raised when course registry configuration is invalid."""


class CourseInfo(BaseModel):
    id: str = Field(alias="course_id")
    code: str = Field(alias="course_code")
    name: str = Field(alias="course_name")
    term: str | None = None
    status: str = "active"


class CourseRegistry(BaseModel):
    courses: dict[str, CourseInfo]

    @classmethod
    def load(cls, path: str | Path) -> CourseRegistry:
        registry_path = Path(path)
        try:
            raw = yaml.safe_load(registry_path.read_text(encoding="utf-8"))
        except yaml.YAMLError as exc:
            raise CourseRegistryError(f"Malformed YAML in {registry_path}: {exc}") from exc
        except OSError as exc:
            raise CourseRegistryError(f"Cannot read course registry {registry_path}: {exc}") from exc

        if not isinstance(raw, dict) or not isinstance(raw.get("courses"), dict):
            raise CourseRegistryError("Course registry must contain a 'courses' mapping")
        try:
            registry = cls.model_validate(raw)
        except ValidationError as exc:
            raise CourseRegistryError(f"Invalid course registry {registry_path}: {exc}") from exc

        course_ids = [course.id for course in registry.courses.values()]
        duplicates = sorted({course_id for course_id in course_ids if course_ids.count(course_id) > 1})
        if duplicates:
            raise CourseRegistryError(f"Duplicate course_id values: {', '.join(duplicates)}")
        return registry

    def resolve_folder(self, folder_name: str) -> CourseInfo:
        try:
            return self.courses[folder_name]
        except KeyError as exc:
            raise CourseRegistryError(f"Unknown course folder: {folder_name}") from exc
