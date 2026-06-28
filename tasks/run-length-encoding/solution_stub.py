def encode(s):
    if not s:
        return ""
    result = []
    prev = s[0]
    count = 1
    for ch in s[1:]:
        if ch == prev:
            count += 1
        else:
            result.append(prev + str(count))
            prev = ch
            count = 1
    # BUG: the final run (prev/count) is never appended.
    return "".join(result)
