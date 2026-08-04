(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();
  var green = style.getPropertyValue('--green').trim();
  var orange = style.getPropertyValue('--orange').trim();
  var red = style.getPropertyValue('--red').trim();
  var purple = style.getPropertyValue('--purple').trim();

  // --- Chart 1: Platform Feature Coverage Radar ---
  var chart1El = document.getElementById('chart-platform-compare');
  if (chart1El) {
    var chart1 = echarts.init(chart1El, null, { renderer: 'svg' });
    chart1.setOption({
      animation: false,
      tooltip: { trigger: 'item', appendToBody: true },
      legend: {
        data: ['Commons', 'B站', '微博', '小红书', '贴吧'],
        bottom: 0,
        textStyle: { color: muted, fontSize: 12 }
      },
      radar: {
        indicator: [
          { name: '内容创作', max: 10 },
          { name: '内容分发', max: 10 },
          { name: '用户互动', max: 10 },
          { name: '用户成长', max: 10 },
          { name: '社交关系', max: 10 },
          { name: '社区治理', max: 10 },
          { name: '消息通知', max: 10 }
        ],
        axisName: { color: ink, fontSize: 12 },
        splitLine: { lineStyle: { color: rule } },
        splitArea: { areaStyle: { color: [bg2, 'transparent'] } },
        axisLine: { lineStyle: { color: rule } }
      },
      series: [{
        type: 'radar',
        data: [
          { value: [5, 4, 7, 0, 5, 5, 8], name: 'Commons', itemStyle: { color: red }, lineStyle: { width: 2.5 }, areaStyle: { opacity: 0.15 } },
          { value: [9, 9, 8, 9, 8, 9, 9], name: 'B站', itemStyle: { color: accent }, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
          { value: [9, 9, 7, 7, 8, 9, 8], name: '微博', itemStyle: { color: orange }, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
          { value: [9, 8, 8, 7, 6, 8, 8], name: '小红书', itemStyle: { color: green }, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } },
          { value: [7, 6, 7, 9, 6, 8, 7], name: '贴吧', itemStyle: { color: purple }, lineStyle: { width: 2 }, areaStyle: { opacity: 0.08 } }
        ]
      }]
    });
    window.addEventListener('resize', function() { chart1.resize(); });
  }

  // --- Chart 2: Priority Distribution ---
  var chart2El = document.getElementById('chart-priority');
  if (chart2El) {
    var chart2 = echarts.init(chart2El, null, { renderer: 'svg' });
    chart2.setOption({
      animation: false,
      tooltip: { trigger: 'item', appendToBody: true, formatter: '{b}: {c} 项 ({d}%)' },
      legend: {
        bottom: 0,
        textStyle: { color: muted, fontSize: 12 }
      },
      series: [{
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['50%', '42%'],
        avoidLabelOverlap: true,
        itemStyle: { borderRadius: 8, borderColor: bg2, borderWidth: 2 },
        label: {
          show: true,
          formatter: '{b}\n{c} 项',
          color: ink,
          fontSize: 13,
          fontWeight: 600
        },
        labelLine: { show: true },
        data: [
          { value: 6, name: '第一梯队 P0', itemStyle: { color: red } },
          { value: 6, name: '第二梯队 P1', itemStyle: { color: orange } },
          { value: 6, name: '第三梯队 P2', itemStyle: { color: accent } }
        ]
      }]
    });
    window.addEventListener('resize', function() { chart2.resize(); });
  }
})();
