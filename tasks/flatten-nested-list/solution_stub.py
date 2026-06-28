def flatten(lst):
    # BUG: only flattens one level deep.
    result = []
    for x in lst:
        if isinstance(x, list):
            result.extend(x)
        else:
            result.append(x)
    return result
