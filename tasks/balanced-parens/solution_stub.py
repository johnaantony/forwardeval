def is_balanced(s):
    # BUG: only counts openers vs closers and ignores bracket TYPE/order,
    # so "([)]" is wrongly accepted.
    count = 0
    for ch in s:
        if ch in "([{":
            count += 1
        elif ch in ")]}":
            count -= 1
            if count < 0:
                return False
    return count == 0
