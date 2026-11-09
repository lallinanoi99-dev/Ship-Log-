// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Ship Log — a daily build-in-public log on BOT Chain.
/// One entry per wallet per UTC day (a second call the same day updates it). Streaks count consecutive
/// UTC days; one missed day per week is bridged by a "freeze". No tokens, no payments.
contract ShipLog {
    // ------------------------------------------------------------------ types
    struct Entry {
        uint32 day; // block.timestamp / 1 days (UTC)
        string shipped;
        string blocked;
        string next;
        string link;
        uint8 tag; // 0 Building · 1 Fixing · 2 Designing · 3 Learning · 4 Launching · 5 Resting
        uint8 energy; // 0 low · 1 mid · 2 high
        uint16 commits;
        uint64 at;
    }

    struct Profile {
        address who;
        string handle;
        string bio;
        string repos; // up to 5 "owner/repo", comma-separated
        uint32 lastDay;
        uint32 streak;
        uint32 bestStreak;
        uint32 totalDays;
        uint32 totalCommits;
        uint32 freezeWeek; // week index + 1 of the last freeze used (0 = never)
        bool hidden;
    }

    struct FeedItem {
        address who;
        string handle;
        uint32 index; // position in the builder's entries
        uint32 streak; // the streak when it was logged
        bool hidden;
        Entry entry;
    }

    struct Ref {
        address who;
        uint32 index;
        uint32 streak;
    }

    // ------------------------------------------------------------------ limits
    uint8 public constant TAG_COUNT = 6;
    uint8 public constant ENERGY_COUNT = 3;
    // Byte caps (the app caps characters: 140 / 100 / 100 / 100; bytes leave room for emoji and accents)
    uint256 private constant MAX_SHIPPED = 560;
    uint256 private constant MAX_SHORT = 400;
    uint256 private constant MAX_LINK = 200;
    uint256 private constant MAX_BIO = 400;
    uint256 private constant MAX_REPOS = 300;
    uint256 private constant MAX_PAGE = 200;

    // ------------------------------------------------------------------ storage
    mapping(bytes32 => address) public handleOwner;
    mapping(address => string) public handleOf;
    mapping(address => string) public bioOf;
    mapping(address => string) public reposOf;
    mapping(address => Entry[]) internal entries;
    mapping(address => uint32) public lastDay;
    mapping(address => uint32) public streak;
    mapping(address => uint32) public bestStreak;
    mapping(address => uint32) public totalDays;
    mapping(address => uint32) public totalCommits;
    mapping(address => uint32) public freezeWeek;
    mapping(address => bool) public hidden;
    address public curator;

    address[] public builders;
    Ref[] internal feed;

    // ------------------------------------------------------------------ events
    event HandleClaimed(address indexed who, string handle);
    event ProfileUpdated(address indexed who);
    event Logged(address indexed who, uint32 indexed day, uint8 tag, uint16 commits, uint32 streak);
    event HiddenSet(address indexed who, bool hidden);
    event CuratorChanged(address indexed curator);

    // ------------------------------------------------------------------ errors
    error BadHandle();
    error HandleTaken();
    error TooLong();
    error NoHandle();
    error EmptyShipped();
    error BadTag();
    error BadEnergy();
    error NotCurator();

    constructor() {
        curator = msg.sender;
        emit CuratorChanged(msg.sender);
    }

    // ------------------------------------------------------------------ profile
    /// @notice Claim (or change) your handle: 3–20 chars, lowercase a–z, 0–9 and _. Also sets bio and repos.
    function claimHandle(string calldata handle, string calldata bio, string calldata repos) external {
        bytes memory h = bytes(handle);
        if (h.length < 3 || h.length > 20) revert BadHandle();
        for (uint256 i; i < h.length; ++i) {
            bytes1 c = h[i];
            if (!((c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39) || c == 0x5f)) revert BadHandle();
        }
        bytes32 key = keccak256(h);
        address owner = handleOwner[key];
        if (owner != address(0) && owner != msg.sender) revert HandleTaken();
        _checkProfile(bio, repos);

        string memory old = handleOf[msg.sender];
        if (bytes(old).length == 0) builders.push(msg.sender);
        else if (keccak256(bytes(old)) != key) delete handleOwner[keccak256(bytes(old))];

        handleOwner[key] = msg.sender;
        handleOf[msg.sender] = handle;
        bioOf[msg.sender] = bio;
        reposOf[msg.sender] = repos;
        emit HandleClaimed(msg.sender, handle);
    }

    /// @notice Update bio and linked repos (keeps your handle).
    function updateProfile(string calldata bio, string calldata repos) external {
        if (bytes(handleOf[msg.sender]).length == 0) revert NoHandle();
        _checkProfile(bio, repos);
        bioOf[msg.sender] = bio;
        reposOf[msg.sender] = repos;
        emit ProfileUpdated(msg.sender);
    }

    function _checkProfile(string calldata bio, string calldata repos) private pure {
        if (bytes(bio).length > MAX_BIO || bytes(repos).length > MAX_REPOS) revert TooLong();
    }

    // ------------------------------------------------------------------ logging
    /// @notice Log today (UTC). A second call the same day updates today's entry.
    function logToday(
        string calldata shipped,
        string calldata blocked,
        string calldata next,
        string calldata link,
        uint8 tag,
        uint8 energy,
        uint16 commits
    ) external {
        if (bytes(handleOf[msg.sender]).length == 0) revert NoHandle();
        if (bytes(shipped).length == 0) revert EmptyShipped();
        if (
            bytes(shipped).length > MAX_SHIPPED || bytes(blocked).length > MAX_SHORT || bytes(next).length > MAX_SHORT
                || bytes(link).length > MAX_LINK
        ) revert TooLong();
        if (tag >= TAG_COUNT) revert BadTag();
        if (energy >= ENERGY_COUNT) revert BadEnergy();

        _log(Entry(uint32(block.timestamp / 1 days), shipped, blocked, next, link, tag, energy, commits, uint64(block.timestamp)));
    }

    function _log(Entry memory n) private {
        Entry[] storage list = entries[msg.sender];
        uint32 last = lastDay[msg.sender];

        if (last == n.day) {
            // same day → update the entry, streak unchanged
            totalCommits[msg.sender] = totalCommits[msg.sender] - list[list.length - 1].commits + n.commits;
            list[list.length - 1] = n;
            emit Logged(msg.sender, n.day, n.tag, n.commits, streak[msg.sender]);
            return;
        }

        uint32 s = 1;
        if (last != 0 && last + 1 == n.day) {
            s = streak[msg.sender] + 1;
        } else if (last != 0 && last + 2 == n.day) {
            // missed exactly one day: a freeze bridges it, once per week (weeks start Monday, UTC)
            uint32 week = weekOf(n.day - 1) + 1;
            if (freezeWeek[msg.sender] != week) {
                freezeWeek[msg.sender] = week;
                s = streak[msg.sender] + 1;
            }
        }

        streak[msg.sender] = s;
        if (s > bestStreak[msg.sender]) bestStreak[msg.sender] = s;
        lastDay[msg.sender] = n.day;
        totalDays[msg.sender] += 1;
        totalCommits[msg.sender] += n.commits;
        list.push(n);
        feed.push(Ref(msg.sender, uint32(list.length - 1), s));
        emit Logged(msg.sender, n.day, n.tag, n.commits, s);
    }

    /// @dev Day 0 (1 Jan 1970) was a Thursday; +3 makes weeks start on Monday.
    function weekOf(uint32 day) public pure returns (uint32) {
        return (day + 3) / 7;
    }

    // ------------------------------------------------------------------ curator
    /// @notice Hide a builder from Explore (spam). Their profile and entries stay on-chain.
    function setHidden(address who, bool value) external {
        if (msg.sender != curator) revert NotCurator();
        hidden[who] = value;
        emit HiddenSet(who, value);
    }

    function setCurator(address next) external {
        if (msg.sender != curator) revert NotCurator();
        curator = next;
        emit CuratorChanged(next);
    }

    // ------------------------------------------------------------------ views
    function currentDay() external view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    function stats() external view returns (uint256 builderCount, uint256 entryCount) {
        return (builders.length, feed.length);
    }

    function addrOfHandle(string calldata handle) external view returns (address) {
        return handleOwner[keccak256(bytes(handle))];
    }

    function entryCountOf(address who) external view returns (uint256) {
        return entries[who].length;
    }

    /// @notice Entries in logging order, `count` from index `from` (clipped to what exists).
    function getEntries(address who, uint256 from, uint256 count) external view returns (Entry[] memory out) {
        Entry[] storage list = entries[who];
        if (from >= list.length) return new Entry[](0);
        if (count > MAX_PAGE) count = MAX_PAGE;
        uint256 end = from + count > list.length ? list.length : from + count;
        out = new Entry[](end - from);
        for (uint256 i = from; i < end; ++i) out[i - from] = list[i];
    }

    function getProfile(address who) public view returns (Profile memory p) {
        p = Profile(
            who,
            handleOf[who],
            bioOf[who],
            reposOf[who],
            lastDay[who],
            streak[who],
            bestStreak[who],
            totalDays[who],
            totalCommits[who],
            freezeWeek[who],
            hidden[who]
        );
    }

    /// @notice Builders (wallets with a handle) in sign-up order.
    function getBuilders(uint256 from, uint256 count) external view returns (Profile[] memory out) {
        if (from >= builders.length) return new Profile[](0);
        if (count > MAX_PAGE) count = MAX_PAGE;
        uint256 end = from + count > builders.length ? builders.length : from + count;
        out = new Profile[](end - from);
        for (uint256 i = from; i < end; ++i) out[i - from] = getProfile(builders[i]);
    }

    /// @notice Newest-first feed of everyone's entries. `skip` newest items are skipped.
    function getFeed(uint256 skip, uint256 count) external view returns (FeedItem[] memory out) {
        uint256 n = feed.length;
        if (skip >= n) return new FeedItem[](0);
        if (count > MAX_PAGE) count = MAX_PAGE;
        if (count > n - skip) count = n - skip;
        out = new FeedItem[](count);
        for (uint256 i; i < count; ++i) {
            Ref storage r = feed[n - 1 - skip - i];
            out[i] = FeedItem(r.who, handleOf[r.who], r.index, r.streak, hidden[r.who], entries[r.who][r.index]);
        }
    }
}
