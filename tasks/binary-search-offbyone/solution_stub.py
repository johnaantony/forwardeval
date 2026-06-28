def search(arr, target):
    lo = 0
    hi = len(arr) - 1
    while lo < hi:  # BUG: should be lo <= hi, so the final element is skipped
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        elif arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
