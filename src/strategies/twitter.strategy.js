function format(content) {
  const trimmedContent = content.trim();

  if (trimmedContent.length <= 280) {
    return trimmedContent;
  }

  return `${trimmedContent.slice(0, 277)}...`;
}

export default {
  format
};