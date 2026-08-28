package notification

import (
	"testing"
	"time"

	"github.com/abc-binary-star/ai-community/server-go/internal/model"
)

// inQuietAt 构造指定小时的时刻
func inQuietAt(hour int) time.Time {
	return time.Date(2026, 8, 10, hour, 30, 0, 0, time.Local)
}

func TestInQuietWindow(t *testing.T) {
	cases := []struct {
		name       string
		hour       int
		start, end int
		want       bool
	}{
		{name: "same-day-in", hour: 3, start: 1, end: 5, want: true},
		{name: "same-day-before", hour: 0, start: 1, end: 5, want: false},
		{name: "same-day-after", hour: 6, start: 1, end: 5, want: false},
		{name: "same-day-boundary-start", hour: 1, start: 1, end: 5, want: true},
		{name: "same-day-boundary-end", hour: 5, start: 1, end: 5, want: false},
		{name: "cross-midnight-night", hour: 23, start: 22, end: 8, want: true},
		{name: "cross-midnight-morning", hour: 7, start: 22, end: 8, want: true},
		{name: "cross-midnight-outside", hour: 12, start: 22, end: 8, want: false},
		{name: "cross-midnight-boundary-end", hour: 8, start: 22, end: 8, want: false},
	}
	for _, c := range cases {
		if got := inQuietWindow(inQuietAt(c.hour), c.start, c.end); got != c.want {
			t.Errorf("%s: inQuietWindow(hour=%d, %d-%d) = %v, want %v", c.name, c.hour, c.start, c.end, got, c.want)
		}
	}
}

func TestQuietEndTime(t *testing.T) {
	day := func(d, hour int) time.Time {
		return time.Date(2026, 8, 10, 0, 0, 0, 0, time.Local).AddDate(0, 0, d).Add(time.Duration(hour) * time.Hour)
	}
	cases := []struct {
		name       string
		hour       int
		start, end int
		want       time.Time
	}{
		{name: "same-day-window", hour: 3, start: 1, end: 5, want: day(0, 5)},
		{name: "cross-midnight-morning", hour: 7, start: 22, end: 8, want: day(0, 8)},
		{name: "cross-midnight-night", hour: 23, start: 22, end: 8, want: day(1, 8)},
		{name: "same-day-boundary-start", hour: 1, start: 1, end: 5, want: day(0, 5)},
	}
	for _, c := range cases {
		if got := quietEndTime(inQuietAt(c.hour), c.start, c.end); !got.Equal(c.want) {
			t.Errorf("%s: quietEndTime(hour=%d, %d-%d) = %v, want %v", c.name, c.hour, c.start, c.end, got, c.want)
		}
	}
}

func TestAllowsType(t *testing.T) {
	pref := func(comment, reply, like, follow, mention bool) *model.NotificationPreference {
		return &model.NotificationPreference{
			Comment: comment, Reply: reply, Like: like, Follow: follow, Mention: mention,
		}
	}

	cases := []struct {
		name      string
		pref      *model.NotificationPreference
		notifType string
		want      bool
	}{
		{name: "comment-on", pref: pref(true, true, true, true, true), notifType: "comment", want: true},
		{name: "comment-off", pref: pref(false, true, true, true, true), notifType: "comment", want: false},
		{name: "reply-off", pref: pref(true, false, true, true, true), notifType: "reply", want: false},
		{name: "like-off", pref: pref(true, true, false, true, true), notifType: "like", want: false},
		{name: "follow-off", pref: pref(true, true, true, false, true), notifType: "follow", want: false},
		{name: "mention-off", pref: pref(true, true, true, true, false), notifType: "mention", want: false},
		{name: "unknown-type-default-allow", pref: pref(false, false, false, false, false), notifType: "system", want: true},
	}
	for _, c := range cases {
		if got := allowsType(c.pref, c.notifType); got != c.want {
			t.Errorf("%s: allowsType(%s) = %v, want %v", c.name, c.notifType, got, c.want)
		}
	}
}
