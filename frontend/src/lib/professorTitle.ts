const TITLE_SPLIT_PATTERN = /[、，,/／|｜；;\s]+/;

const TITLE_PRIORITY: Record<string, number> = {
  教授: 10,
  副教授: 20,
  助理教授: 30,
  讲师: 40,
  研究员: 50,
  副研究员: 60,
  助理研究员: 70,
  特聘研究员: 80,
  博导: 200,
  硕导: 210,
};

type TaggedTitle = {
  value: string;
  index: number;
};

const normalizeTitleParts = (title: string): TaggedTitle[] => {
  const seen = new Set<string>();

  return title
    .split(TITLE_SPLIT_PATTERN)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap((value, index) => {
      if (seen.has(value)) {
        return [];
      }
      seen.add(value);
      return [{ value, index }];
    })
    .sort((first, second) => {
      const firstPriority = TITLE_PRIORITY[first.value] ?? 1000;
      const secondPriority = TITLE_PRIORITY[second.value] ?? 1000;
      if (firstPriority !== secondPriority) {
        return firstPriority - secondPriority;
      }
      return first.index - second.index;
    });
};

export const extractProfessorTitleTags = (title: string | null | undefined): string[] => {
  if (!title?.trim()) {
    return [];
  }
  return normalizeTitleParts(title).map((item) => item.value);
};

export const normalizeProfessorTitleDisplay = (
  title: string | null | undefined,
): string | null => {
  const tags = extractProfessorTitleTags(title);
  if (tags.length === 0) {
    return null;
  }
  return tags.join(" / ");
};

export const matchesProfessorTitleTag = (
  title: string | null | undefined,
  filterValue: string,
): boolean => {
  if (!filterValue.trim()) {
    return false;
  }
  return extractProfessorTitleTags(title).includes(filterValue.trim());
};
