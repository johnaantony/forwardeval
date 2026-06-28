def merge(intervals):
    # BUG: does not sort the input first, so unsorted intervals are merged
    # incorrectly.
    if not intervals:
        return []
    result = [list(intervals[0])]
    for s, e in intervals[1:]:
        last = result[-1]
        if s <= last[1]:
            last[1] = max(last[1], e)
        else:
            result.append([s, e])
    return result
