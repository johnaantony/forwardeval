def flatten(lst):
    result = []
    for x in lst:
        if isinstance(x, list):
            result.extend(flatten(x))
        else:
            result.append(x)
    return result
