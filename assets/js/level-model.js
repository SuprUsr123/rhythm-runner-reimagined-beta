var LevelModel = (function () {
  var T = {
    "solid": [
      0,1,2,3,4,6,7,40,62,63,64,65,66,68,69,70,71,72,74,75,76,77,78,81,82,
      83,90,91,92,93,94,95,96,116,117,118,119,121,122,143,146,147,160,161,162,163,165,166,167,168,
      169,170,171,172,173,174,175,176,192,194,195,196,197,204,206,207,208,209,210,212,213,215,219,220,247,
      248,249,250,252,253,254,255,256,257,258,260,261,263,264,265,267,268,269,270,271,272,274,275,328,329,
      369,370,467,468,469,470,471,475,661,662,663,664,1154,1155,1156,1157,1202,1203,1204,1208,1209,1210,1220,1221,1222,
      1226,1227,1260,1262,1264,1340,1343,1561,1562,1563,1564,1565,1566,1567,1568,1569,1903,1904,1905,1910,1911
    ],
    "spikes": [8,39,103,144,145,177,178,179,205,216,217,218,392,458,459,3034,3035,3036,3037],
    "foot": {"329":[2,1],"1568":[3,2],"1569":[2,2]},
    "slopes": [
      [289,1,1,1],[291,2,1,-1],[294,1,1,1],[295,2,1,1],[299,1,1,1],[301,2,1,1],[305,1,1,1],[307,2,1,1],[309,1,1,1],[311,2,1,1],[315,1,1,1],[317,2,1,1],[321,1,1,1],[323,2,1,1],[326,1,1,1],[327,2,1,1],[331,1,1,1],[333,2,1,1],[337,1,1,1],[339,2,1,1],[343,1,1,1],[345,2,1,1],[349,1,1,1],[351,2,1,1],[353,1,1,1],[355,2,1,1],[363,1,1,1],[364,2,1,1],[366,1,1,1],[367,2,1,1],[371,1,1,1],[372,2,1,1],[483,1,1,1],[484,2,1,1],[492,1,1,1],[493,2,1,1],[651,1,1,1],[652,2,1,1],[665,1,1,1],[666,2,1,1],
      [673,1,1,1],[674,2,1,1],[681,1,1,1],[682,2,1,1],[683,1,1,1],[684,2,1,1],[685,0.85,0.85,1],[686,1.85,0.933,1],[687,1,1,1],[688,2,1,1],[689,1,1,1],[690,2,1,1],[691,1,1,1],[692,2,1,1],[693,1,1,1],[694,2,1,1],[695,1,1,1],[696,2,1,1],[697,1,1,1],[698,2,1,1],[699,0.85,0.85,1],[700,1.85,0.933,1],[701,1,1,1],[702,2,1,1],[703,1,1,1],[704,2,1,1],[705,0.767,0.767,1],[706,1.733,0.883,1],[707,1,1,1],[708,2,1,1],[709,1,1,1],[710,2,1,1],[711,1,1,1],[712,2,1,1],[713,1,1,1],[714,2,1,1],[715,1,1,1],[716,2,1,1],[726,1,1,1],[727,2,1,1],
      [728,1,1,1],[729,2,1,1],[730,1,1,1],[731,2,1,1],[732,1,1,1],[733,2,1,1],[762,0.617,0.583,1],[763,1.283,0.6,1],[771,0.617,0.583,1],[772,1.283,0.6,1],[826,1,1,1],[827,1,1,1],[828,2,1,1],[829,2,1,1],[877,1,1,1],[878,2,1,1],[886,1,1,1],[887,2,1,1],[888,1,1,1],[889,2,1,1],[895,1,1,1],[896,2,1,1],[960,0.617,0.583,1],[961,1.283,0.6,1],[969,0.617,0.583,1],[970,1.283,0.6,1],[1014,1,1,1],[1015,2,1,1],[1033,0.617,0.583,1],[1034,1.283,0.6,1],[1037,0.617,0.583,1],[1038,1.283,0.6,1],[1041,1,1,1],[1042,2,1,1],[1043,1,1,1],[1044,2,1,1],[1091,1,1,1],[1092,2,1,1],[1108,2,1,1],[1187,0.767,0.767,1],
      [1188,1.517,0.767,1],[1198,1,1,1],[1199,2,1,1],[1256,1,1,1],[1257,2,1,1],[1258,1,1,1],[1259,2,1,1],[1305,0.617,0.583,1],[1306,1.3,0.6,1],[1316,0.617,0.583,1],[1317,1.3,0.6,1],[1338,1,1,1],[1339,2,1,1],[1341,1,1,1],[1342,2,1,1],[1344,1,1,1],[1345,2,1,1],[1717,1,1,1],[1718,2,1,1],[1723,1,1,1],[1724,2,1,1],[1743,1,1,1],[1744,2,1,1],[1745,1,1,1],[1746,2,1,1],[1747,1,1,1],[1748,2,1,1],[1749,1,1,1],[1750,2,1,1],[1758,1,1,1],[1759,2,1,1],[1760,1,1,1],[1761,2,1,1],[1762,1,1,1],[1763,2,1,1],[1773,2,1,1],[1774,2,1,1],[1775,2,1,1],[1776,2,1,1],[1785,2,1,1],
      [1786,2,1,1],[1787,2,1,1],[1788,2,1,1],[1789,2,1,1],[1790,2,1,1],[1791,2,1,1],[1792,2,1,1],[1794,2,1,1],[1796,2,1,1],[1798,2,1,1],[1800,2,1,1],[1802,2,1,1],[1804,2,1,1],[1806,2,1,1],[1808,2,1,1],[1810,2,1,1],[1899,1,1,1],[1900,2,1,1],[1906,1,1,1],[1907,2,1,1]
    ],
    "deco": [5,73,80,120,193,211,233,251,259,266,273,279,280,281,282],
    "decor": [
      15,16,17,18,19,20,21,41,44,48,49,50,51,52,53,54,60,85,86,87,97,106,107,110,113,
      114,115,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,148,149,150,151,152,153,
      154,155,156,157,158,159,164,180,181,182,190,191,198,199,222,223,224,225,226,227,228,229,230,231,232,
      234,235,236,237,238,239,240,241,242,245,246,277,278,283,284,285,289,291,294,295,296,297,299,301,305,
      307,309,311,315,317,321,323,324,325,326,327,331,333,337,339,343,345,349,351,353,355,358,363,364,366,
      367,371,372,373,374,375,376,377,378,393,394,395,396,405,406,407,408,409,410,411,412,413,414,419,420,
      448,449,450,451,452,453,454,455,456,457,460,461,462,463,464,465,466,472,473,474,476,477,478,479,480,
      481,482,483,484,485,486,487,488,489,490,491,492,493,494,495,496,497,498,499,500,501,502,503,504,505,
      506,507,508,509,510,511,512,513,514,515,516,517,518,519,520,521,522,523,524,525,526,527,528,529,530,
      531,532,533,534,535,536,537,538,539,540,541,542,543,544,545,546,547,548,549,550,551,552,553,554,555,
      556,557,558,559,560,561,562,563,564,565,566,567,568,569,570,571,572,573,574,575,576,577,578,579,580,
      581,582,583,584,585,586,587,588,589,590,591,592,593,594,595,596,597,598,599,600,601,602,603,604,605,
      606,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621,622,623,624,625,626,627,628,629,630,
      631,632,633,634,635,636,637,638,639,640,641,642,643,644,645,646,647,648,649,650,651,652,653,654,655,
      656,657,658,659,665,666,668,669,670,671,672,673,674,681,682,683,684,685,686,687,688,689,690,691,692,
      693,694,695,696,697,698,699,700,701,702,703,704,705,706,707,708,709,710,711,712,713,714,715,716,719,
      721,722,723,724,725,726,727,728,729,730,731,732,733,734,735,736,737,738,739,752,753,754,755,756,757,
      758,759,762,763,764,765,766,767,769,770,771,772,773,774,775,807,808,809,810,811,812,813,814,815,816,
      817,818,819,820,821,822,823,824,825,826,827,828,829,830,831,832,833,841,842,843,844,845,846,847,848,
      850,853,854,855,856,857,859,861,862,863,867,868,869,870,871,872,873,874,877,878,880,881,882,883,884,
      885,886,887,888,889,890,891,893,894,895,896,902,903,904,905,906,907,908,909,910,911,916,917,920,921,
      923,924,925,926,927,928,929,930,931,932,933,934,935,936,937,938,939,940,941,942,943,944,945,946,947,
      948,949,950,951,952,953,954,955,956,957,958,959,960,961,964,965,966,967,968,969,970,971,972,973,974,
      975,976,977,980,981,982,983,984,985,986,987,988,990,992,997,998,999,1000,1001,1002,1003,1004,1005,1009,1010,
      1011,1012,1013,1014,1015,1016,1017,1018,1019,1020,1021,1024,1025,1026,1027,1028,1029,1030,1031,1032,1033,1034,1035,1036,1037,
      1038,1039,1040,1041,1042,1043,1044,1045,1046,1047,1048,1050,1051,1052,1053,1054,1055,1056,1057,1058,1059,1060,1061,1062,1063,
      1064,1065,1066,1067,1068,1069,1070,1071,1075,1076,1077,1078,1079,1080,1081,1082,1083,1084,1085,1086,1087,1088,1089,1090,1091,
      1092,1093,1094,1095,1096,1097,1098,1099,1100,1101,1102,1103,1104,1105,1106,1107,1108,1109,1110,1111,1112,1113,1114,1115,1116,
      1117,1118,1120,1122,1123,1124,1125,1126,1127,1132,1133,1134,1135,1136,1137,1138,1139,1140,1141,1142,1143,1144,1145,1146,1147,
      1148,1149,1150,1151,1152,1153,1158,1159,1160,1161,1162,1163,1164,1165,1166,1167,1168,1169,1170,1171,1172,1173,1174,1175,1176,
      1177,1178,1179,1180,1181,1182,1183,1184,1185,1186,1187,1188,1189,1190,1191,1192,1193,1194,1195,1196,1197,1198,1199,1200,1201,
      1205,1206,1207,1223,1224,1225,1228,1229,1230,1231,1232,1233,1234,1235,1236,1237,1238,1239,1240,1241,1242,1243,1244,1245,1246,
      1247,1248,1249,1250,1251,1252,1253,1254,1255,1256,1257,1258,1259,1261,1263,1265,1266,1267,1269,1270,1271,1272,1273,1274,1275,
      1276,1277,1278,1279,1280,1281,1282,1283,1284,1285,1286,1287,1288,1289,1290,1291,1292,1293,1294,1295,1296,1297,1298,1299,1300,
      1301,1302,1303,1304,1305,1306,1307,1308,1309,1310,1311,1312,1313,1314,1315,1316,1317,1318,1319,1320,1322,1325,1326,1338,1339,
      1341,1342,1344,1345,1348,1349,1350,1351,1352,1353,1354,1355,1356,1357,1358,1359,1360,1361,1362,1363,1364,1365,1366,1367,1368,
      1369,1370,1371,1372,1373,1374,1375,1376,1377,1378,1379,1380,1381,1382,1383,1384,1385,1386,1387,1388,1389,1390,1391,1392,1393,
      1394,1395,1431,1432,1433,1434,1435,1436,1437,1438,1439,1440,1441,1442,1443,1444,1445,1446,1447,1448,1449,1450,1451,1452,1453,
      1454,1455,1456,1457,1458,1459,1460,1461,1462,1463,1464,1471,1472,1473,1496,1507,1510,1511,1512,1513,1514,1515,1516,1517,1518,
      1519,1521,1522,1523,1524,1525,1526,1527,1528,1529,1530,1531,1532,1533,1534,1535,1536,1537,1538,1539,1540,1552,1553,1554,1555,
      1556,1557,1558,1559,1560,1587,1588,1589,1590,1591,1592,1593,1596,1597,1598,1599,1600,1601,1602,1603,1604,1605,1606,1607,1608,
      1609,1610,1617,1618,1621,1622,1623,1624,1625,1626,1627,1628,1629,1630,1631,1632,1633,1634,1635,1636,1637,1638,1639,1640,1641,
      1642,1643,1644,1645,1646,1647,1648,1649,1650,1651,1652,1653,1654,1655,1656,1657,1658,1659,1660,1661,1662,1663,1664,1665,1666,
      1667,1668,1669,1670,1671,1672,1673,1674,1675,1676,1677,1678,1679,1680,1681,1682,1683,1684,1685,1686,1687,1688,1689,1690,1691,
      1692,1693,1694,1695,1696,1697,1698,1699,1717,1718,1723,1724,1737,1738,1739,1740,1741,1742,1743,1744,1745,1746,1747,1748,1749,
      1750,1752,1753,1754,1755,1756,1757,1758,1759,1760,1761,1762,1763,1764,1765,1766,1767,1768,1769,1770,1771,1772,1773,1774,1775,
      1776,1777,1778,1779,1780,1781,1782,1783,1784,1785,1786,1787,1788,1789,1790,1791,1792,1793,1794,1795,1796,1797,1798,1799,1800,
      1801,1802,1803,1804,1805,1806,1807,1808,1809,1810,1813,1820,1821,1823,1824,1825,1826,1827,1828,1829,1830,1831,1832,1833,1834,
      1835,1836,1837,1838,1839,1840,1841,1842,1843,1844,1845,1846,1847,1848,1849,1850,1851,1852,1853,1854,1855,1856,1857,1858,1859,
      1860,1861,1862,1863,1864,1865,1866,1867,1868,1869,1870,1871,1872,1873,1874,1875,1876,1877,1878,1879,1880,1881,1882,1883,1884,
      1885,1886,1887,1888,1889,1890,1891,1892,1893,1894,1895,1896,1897,1898,1899,1900,1901,1902,1906,1907,1908,1909,1919,1920,1921,
      1922,1923,1924,1925,1926,1927,1928,1936,1937,1938,1939,1964,2020,2021,2022,2023,2024,2025,2026,2027,2028,2029,2030,2031,2032,
      2033,2034,2035,2036,2037,2038,2039,2040,2041,2042,2043,2044,2045,2046,2047,2048,2049,2050,2051,2052,2053,2054,2055,2063,2064,
      2703,2704,2708,2709,2710,2711,2712,2713,2714,2715,2716,2717,2718,2719,2720,2721,2722,2723,2724,2725,2726,2727,2728,2729,2730,
      2731,2732,2733,2734,2735,2736,2737,2738,2739,2740,2741,2742,2743,2744,2745,2746,2747,2748,2749,2750,2751,2752,2753,2754,2755,
      2756,2757,2758,2759,2760,2761,2762,2763,2764,2765,2766,2767,2768,2769,2770,2773,2776,2777,2778,2779,2780,2781,2782,2783,2784,
      2785,2786,2787,2788,2789,2790,2791,2792,2793,2794,2795,2796,2797,2798,2799,2800,2801,2802,2803,2804,2805,2806,2807,2808,2809,
      2810,2811,2812,2813,2814,2815,2816,2817,2818,2819,2820,2821,2822,2823,2824,2825,2826,2827,2828,2829,2830,2831,2832,2833,2834,
      2835,2836,2837,2838,2839,2840,2841,2842,2843,2844,2845,2846,2847,2848,2849,2850,2851,2852,2853,2854,2855,2856,2857,2858,2859,
      2860,2861,2862,2863,2864,2865,2866,2867,2868,2869,2870,2871,2872,2873,2874,2875,2876,2877,2878,2879,2880,2881,2882,2883,2884,
      2885,2886,2887,2888,2889,2890,2891,2892,2893,2894,2895,2896,2897,2902,2927,2928,2929,2930,2931,2932,2933,2934,2935,2936,2937,
      2938,2939,2940,2941,2942,2943,2944,2945,2946,2947,2948,2949,2950,2951,2952,2953,2954,2955,2956,2957,2958,2959,2960,2961,2962,
      2963,2964,2965,2966,2967,2968,2969,2970,2971,2972,2973,2974,2975,2976,2977,2978,2979,2980,2981,2982,2983,2984,2985,2986,2987,
      2988,2989,2990,2991,2992,2993,2994,2995,2996,2997,2998,3000,3001,3002,3038,3039,3040,3041,3042,3043,3044,3045,3046,3047,3048,
      3049,3050,3051,3052,3053,3054,3055,3056,3057,3058,3059,3060,3061,3062,3063,3064,3065,3066,3067,3068,3069,3070,3071,3072,3073,
      3074,3075,3076,3077,3078,3079,3080,3081,3082,3083,3084,3085,3086,3087,3088,3089,3090,3091,3601,3621,3622,3623,3624,3625,3626,
      3627,3628,3629,3630,3631,3632,3633,3634,3635,3636,3637,3638,3639,1614
    ],
    "hazards": [
      [9,1,1,1],[61,1,1,1],[88,1,1,0],[89,2,2,0],[98,3,3,0],[135,0.3,0.36,0],[183,2,2,0],[184,2,2,0],[185,1,2,0],[186,2,2,0],[187,3,3,0],[188,2,2,0],[243,1,1,1],[244,1,1,1],[365,1,1,1],[368,1,1,1],[397,2,2,0],[398,2,3,0],[399,2,2,0],[421,1,1,1],[422,1,1,1],[446,1,1,1],[447,1,1,1],[667,1,1,1],[675,2,2,0],[676,2,2,0],[677,2,2,0],[678,2,2,0],[679,2,2,0],[680,2,2,0],[720,1,1,1],[740,2,2,0],[741,3,3,0],[742,2,2,0],[768,1,1,1],[918,1,1,0],[919,1,1,0],[989,1,1,1],[991,1,1,1],[1327,1,1,0],
      [1328,1,1,0],[1582,1,1,0],[1583,2,1,0],[1584,1,1,0],[1619,2,2,0],[1620,2,2,0],[1701,1,1,0],[1702,1,1,0],[1703,1,1,0],[1705,2,3,0],[1706,2,2,0],[1707,2,2,0],[1708,2,2,0],[1709,2,3,0],[1710,2,2,0],[1711,2,2,1],[1712,2,2,1],[1713,2,2,1],[1714,2,2,1],[1715,1,1,1],[1716,1,1,1],[1719,1,1,1],[1720,1,1,1],[1721,1,1,1],[1722,1,1,1],[1725,1,1,1],[1726,1,1,1],[1727,1,1,1],[1728,1,1,1],[1729,1,1,1],[1730,1,1,1],[1731,1,1,1],[1732,1,1,1],[1733,1,1,1],[1734,2,2,0],[1735,2,2,0],[1736,2,2,0],[2012,1,1,0]
    ],
  };
  // reference hazard hitboxes (web-dashers / ZainojdafMod): [fullW, fullH] boxes or {r: radius}
  // circles, in 1x units, centred on the object centre; spikes use the same rule
  var HBOX = {
    hb: {
      "8": [6,12],
      "9": [9,10.8],
      "39": [6,5.6],
      "61": [9,7.2],
      "88": {"r":32.3},
      "89": {"r":21.6},
      "98": {"r":11.78},
      "103": [4,7.6],
      "135": [9,10.8],
      "144": [6,12],
      "145": [4,7.6],
      "177": [6,12],
      "178": [6,6.4],
      "179": [4,8],
      "183": {"r":15.3},
      "184": {"r":20.4},
      "185": {"r":2.85},
      "186": {"r":32.3},
      "187": {"r":21.87},
      "188": {"r":12.6},
      "205": [6,5.6],
      "216": [6,12],
      "217": [6,5.6],
      "218": [4,7.6],
      "243": [6,7.2],
      "244": [6,6.8],
      "365": [6,6],
      "368": [6,4],
      "392": [2.6,4.8],
      "397": {"r":28.9},
      "398": {"r":17.44},
      "399": {"r":12.9},
      "421": [6,5.2],
      "422": [6,4.4],
      "446": [6,7.2],
      "447": [5.2,7.2],
      "458": [2.6,4.8],
      "459": [2.6,4.8],
      "667": [6,6],
      "675": {"r":32},
      "676": {"r":17.51},
      "677": {"r":12.48},
      "678": {"r":30.4},
      "679": {"r":18.54},
      "680": {"r":10.8},
      "720": [1.6,3.2],
      "740": {"r":32.3},
      "741": {"r":21.87},
      "742": {"r":12.6},
      "768": [3,5.2],
      "918": {"r":24},
      "919": [5,2.4],
      "989": [6,12],
      "991": [1.6,3.2],
      "1327": [1.6,3.2],
      "1328": [1.6,6],
      "1582": {"r":4},
      "1583": {"r":4},
      "1584": [1.6,3.2],
      "1619": {"r":25},
      "1620": {"r":15},
      "1701": {"r":6},
      "1702": {"r":6},
      "1703": {"r":6},
      "1705": {"r":32.3},
      "1706": {"r":21.6},
      "1707": {"r":11.78},
      "1708": {"r":28.9},
      "1709": {"r":17.44},
      "1710": {"r":12.9},
      "1711": [9.4,20],
      "1712": [9,22.4],
      "1713": [7.8,20],
      "1714": [7.6,16.4],
      "1715": [6,10.8],
      "1716": [6,6],
      "1719": [6,7.2],
      "1720": [6,7.2],
      "1721": [6,6.8],
      "1722": [6,4],
      "1725": [6,5.2],
      "1726": [6,4.4],
      "1727": [3,5.2],
      "1728": [6,7.2],
      "1729": [5.2,7.2],
      "1730": [6,6],
      "1731": [1.6,3.2],
      "1732": [6,12],
      "1733": [1.6,3.2],
      "1734": {"r":32},
      "1735": {"r":17.51},
      "1736": {"r":12.48},
      "2012": {"r":15},
      "3034": [6,12],
      "3035": [4,8],
      "3036": [3,6],
      "3037": [2,4]
    }
    , grids: {
      "8":[1,1],"39":[1,1],"88":[1,1],"89":[2,2],"98":[3,3],"103":[0.5,0.5],"135":[0.3,0.36],"144":[1,1],
      "145":[0.5,0.5],"177":[1,1],"178":[1,0.5333333611488342],"179":[0.6666666865348816,0.6666666865348816],"183":[1.4333332777023315,1.4333332777023315],"184":[2,1.7666666507720947],"185":[0.3333333432674408,1.3333333730697632],"186":[1.4333332777023315,1.4333332777023315],
      "187":[2.0333333015441895,2.0333333015441895],"188":[1.399999976158142,1.399999976158142],"205":[1,0.46666666865348816],"216":[1,1],"217":[1,0.46666666865348816],"218":[0.6666666865348816,0.6333333253860474],"243":[1,0.6000000238418579],"244":[1,0.5666666626930237],
      "365":[1,0.5],"368":[1,0.3333333432674408],"392":[0.5,0.5],"397":[1.4333332777023315,1.4333332777023315],"398":[1.8333333730697632,2.0999999046325684],"399":[1.4333332777023315,1.4333332777023315],"421":[1,0.4333333373069763],"422":[1,0.36666667461395264],
      "446":[1,0.6000000238418579],"447":[0.8666666746139526,0.6000000238418579],"458":[0.4333333373069763,0.4000000059604645],"459":[0.4333333373069763,0.4000000059604645],"667":[1,0.5],"678":[1.3333333730697632,1.3666666746139526],"679":[1.7333333492279053,1.7999999523162842],"680":[1.2000000476837158,1.2000000476837158],
      "720":[0.2666666805744171,0.2666666805744171],"740":[1.4333332777023315,1.4333332777023315],"741":[2.0333333015441895,2.0333333015441895],"742":[1.399999976158142,1.399999976158142],"768":[0.5,0.4333333373069763],"918":[1.600000023841858,1.600000023841858],"919":[0.8333333134651184,0.20000000298023224],"989":[1,1],
      "991":[0.2666666805744171,0.2666666805744171],"1327":[0.2666666805744171,0.2666666805744171],"1328":[0.2666666805744171,0.5],"1582":[0.8999999761581421,0.8666666746139526],"1583":[1.0333333015441895,0.7666666507720947],"1584":[0.2666666805744171,0.2666666805744171],"1619":[1.6333333253860474,1.2999999523162842],"1620":[1.0666667222976685,1.0666667222976685],
      "1701":[0.6666666865348816,0.9333333373069763],"1702":[0.5,0.9666666388511658],"1703":[0.4333333373069763,0.7333333492279053],"1705":[1.4666666984558105,2.8333332538604736],"1706":[2,2],"1707":[1.3333333730697632,1.3333333730697632],"1708":[1.4333332777023315,1.4333332777023315],"1709":[1.8333333730697632,2.0999999046325684],
      "1710":[1.4333332777023315,1.4333332777023315],"1711":[1.5666667222976685,1.6666666269302368],"1712":[1.5,1.8666666746139526],"1713":[1.2999999523162842,1.6666666269302368],"1714":[1.2666666507720947,1.3666666746139526],"1715":[1,0.8999999761581421],"1716":[1,0.5],"1719":[1,0.6000000238418579],
      "1720":[1,0.6000000238418579],"1721":[1,0.5666666626930237],"1722":[1,0.3333333432674408],"1725":[1,0.4333333373069763],"1726":[1,0.36666667461395264],"1727":[0.5,0.4333333373069763],"1728":[1,0.6000000238418579],"1729":[0.8666666746139526,0.6000000238418579],
      "1730":[1,0.5],"1731":[0.2666666805744171,0.2666666805744171],"1732":[1,1],"1733":[0.2666666805744171,0.2666666805744171],"1734":[1.3666666746139526,1.3666666746139526],"1735":[1.7333333492279053,1.7666666507720947],"1736":[1.2999999523162842,1.2999999523162842],"2012":[0.2666666805744171,0.2666666805744171],
      "3034":[1,1],"3035":[0.6666666865348816,0.6666666865348816],"3036":[0.5,0.5],"3037":[0.3333333432674408,0.3333333432674408],"3610":[1,1],"3611":[1,1]
    }
  };
  var SOLID = {}, SPIKE = {}, FOOT = {}, SLOPE = {};
  T.solid.forEach(function (id) { SOLID[id] = true; });
  T.spikes.forEach(function (id) { SPIKE[id] = true; });
  Object.keys(T.foot).forEach(function (k) { FOOT[k] = { w: T.foot[k][0], h: T.foot[k][1] }; });
  T.slopes.forEach(function (s) { SLOPE[s[0]] = { gw: s[1], gh: s[2], dir: s[3] }; });
  // solid decorations (GD type 'soliddeco'): translated into blocks on import
  var DECO = {};
  (T.deco || []).forEach(function (id) { DECO[id] = true; });
  // visual decorations (GD type 'deco'): drawn from the sprite sheets, no collision
  // other hazards (pits, saws, blades, beasts): footprint from the reference table; pit = 1 for ground pits
  var HAZ = {};
  (T.hazards || []).forEach(function (h) { HAZ[h[0]] = { w: h[1], h: h[2], pit: !!h[3] }; });
  var DECOR = {};
  (T.decor || []).concat([1614]).forEach(function (id) { DECOR[id] = true; });
  // recognised-but-inert objects: triggers this engine does not simulate (colour, rotation,
  // follow, collision-block, spawn variants, editor buttons ...) plus invisible deco.
  // ZainojdafMod's allObjects.js types every one of these as 'trigger' / 'deco'; they have
  // no hitbox, so counting them as supported keeps the official levels free of fake skips.
  var FX = {};
  [22,23,24,25,26,27,28,29,30,32,33,56,57,58,59,104,105,221,744,899,900,915,1006,1346,1520,1585,1586,1700,1611,1615,1811,1812,2016,3610,3611].forEach(function (id) { FX[id] = true; });

  // gamemode / gravity / size / mirror / dual / teleport / spider portal kinds (GD ids).
  // Reference (Web Dashers level.js): object 10 (blue) is portal_gravity_down = normal gravity,
  // object 11 (yellow) is portal_gravity_up = flipped gravity.
  var PORTAL = {
    10: 'gravDown', 11: 'gravUp', 2926: 'gravToggle',
    12: 'cube', 13: 'ship', 47: 'ball', 111: 'ufo', 660: 'wave', 745: 'robot', 1331: 'spider',
    99: 'miniOff', 101: 'miniOn',
    45: 'mirrorOn', 46: 'mirrorOff',
    286: 'dualOn', 287: 'dualOff', 1933: 'swing',   // swing portal id per the Lollipop mod (level.js)
    747: 'teleport'
  };
  var EXIT = { 749: true };                       // teleport exits: pair with the nearest entry
  var SPEED_KEY = { 200: 'HALF', 201: 'ONE', 202: 'TWO', 203: 'THREE', 1334: 'FOUR' };
  var BREAKABLE = { 143: true };                  // Electroman blocks: solid from the support face, break on other contact
  var PAD = { 35: true, 140: true, 1332: true, 67: true, 3005: true };
  var ORB = { 36: true, 141: true, 1333: true, 84: true, 1022: true, 1330: true, 1594: true, 1704: true, 1751: true };  // 1704 green dash orb, 1751 blue (gravity-flipping) dash orb
  var COIN = { 142: true, 1329: true };
  // GD 2.2 Force Blocks are invisible gameplay colliders (not editor-only triggers).
  // 2069 is the original Force Block; 3645 is the newer variant.
  var FORCE_BLOCK = { 2069: true, 3645: true };
  var TRIG = { 1049: 'toggle', 1007: 'alpha', 901: 'move', 1616: 'stop', 1268: 'spawn', 1006: 'pulse', 1346: 'rotate', 1913: 'zoom', 1914: 'static', 1916: 'camoffset', 2900: 'rotategp', 2015: 'camrot', 1917: 'reverse', 1932: 'playerControl', 1935: 'timewarp', 2062: 'cameraEdge', 2066: 'gravity', 2925: 'cameraMode', 3022: 'teleport', 3600: 'end', 3604: 'event' };
  // GD 2.2 shader triggers (reference level-shaders.js _parseShaderTrigger/_fireShaderTrigger).
  // Each id maps to one post-FX effect; params are parsed into rec.p below.
  var SHADER_FX = { 2904: 'layers', 2905: 'shockwave', 2907: 'shockline', 2909: 'glitch', 2910: 'chromatic', 2911: 'crt', 2912: 'pixelate', 2913: 'lens', 2914: 'radial', 2915: 'motion', 2916: 'bulge', 2917: 'pinch', 2919: 'grayscale', 2920: 'sepia', 2921: 'invert', 2922: 'hue', 2923: 'color', 2924: 'split' };
  (function () { for (var k in SHADER_FX) TRIG[k] = 'shader'; })();
  // colour triggers (reference level.js LEGACY_COLOR_TRIGGER_CHANNELS): 29 BG, 30 ground,
  // legacy ids carry a default channel; k23 overrides it per instance
  var COL_TRIG = { 29: true, 30: true, 105: true, 221: true, 717: true, 718: true, 743: true, 744: true, 899: true, 900: true, 915: true };
  var COL_TRIG_DEF = { 105: 1004, 221: 1, 717: 2, 718: 3, 743: 4, 744: 1003, 899: 1, 900: 1009, 915: 1002 };
  // legacy 1.9 object colour key k19 → modern channel (reference LEGACY_19_COLOR_CHANNELS)
  var LEGACY19 = { 1: 1005, 2: 1006, 3: 1, 4: 2, 5: 1007, 6: 3, 7: 4, 8: 1003 };
  // GD 2.2 text objects (k31 holds the string, base64url): drawn as text, no collision
  var TEXT = { 914: true };
  // decoration slopes: the reference (level.js _isDecorationSlopeId + _SLOPE_DECO_RANGES) gives only these
  // slope ids NO collider; every other slope id is a real collider (level.js _createSlopeCollider).
  var SLOPE_DECO_RANGES = [
    [681, 708], [713, 716], [730, 763], [771, 772], [826, 829], [877, 878],
    [888, 961], [969, 970], [1014, 1015], [1033, 1034], [1037, 1038],
    [1041, 1092], [1108, 1188], [1198, 1199], [1256, 1306], [1316, 1317],
    [1758, 1900]
  ];
  var DECO_SLOPE = {};
  T.slopes.forEach(function (s) {
    for (var i = 0; i < SLOPE_DECO_RANGES.length; i++) {
      if (s[0] >= SLOPE_DECO_RANGES[i][0] && s[0] <= SLOPE_DECO_RANGES[i][1]) { DECO_SLOPE[s[0]] = true; break; }
    }
  });
  var GROUND = { x0: -1e9, x1: 1e9, y0: -1e9, y1: 0 };
  // Sideways gameplay (reference _swapSidewaysFrame + the transposed collision in getNearbySectionObjects):
  // the cube runs along world y while gravity and jumps act along world x. The step runs on a copy of the
  // collision arrays with x and y exchanged (the ground is left out: there is no floor or ceiling).
  function transposePoint(o) {
    var t = {}, k;
    for (k in o) t[k] = o[k];
    if (o.x0 !== undefined) { t.x0 = o.y0; t.x1 = o.y1; t.y0 = o.x0; t.y1 = o.x1; }
    if (o.cx !== undefined) { t.cx = o.cy; t.cy = o.cx; }
    if (o.w !== undefined && o.h !== undefined) { t.w = o.h; t.h = o.w; }
    if (o.rot !== undefined) t.rot = -o.rot;
    t.orig = o.orig || o;
    t._s = 0; t._aff = false;
    return t;
  }
  // Transposed collision copy for sideways gameplay (reference _sidewaysProxy and the sideways branch of
  // getNearbySectionObjects). Points and boxes exchange x and y, and the rotation is negated. Slopes keep their
  // direction (a reflection across the diagonal preserves the sign of a slope) and their solid side flips on a
  // rising slope. A flat slope (solid below its top edge) becomes a full wall block in the transposed frame.
  // Moving or hidden objects are read from the live list each time it changes, as the reference does.
  function transposeRec(o) {
    var t = {}, k;
    for (k in o) t[k] = o[k];
    if (o.x0 !== undefined) { t.x0 = o.y0; t.x1 = o.y1; t.y0 = o.x0; t.y1 = o.x1; }
    if (o.cx !== undefined) { t.cx = o.cy; t.cy = o.cx; }
    if (o.w !== undefined && o.h !== undefined) { t.w = o.h; t.h = o.w; }
    if (o.rot !== undefined) t.rot = -o.rot;
    // A sideways gameplay transform swaps the force vector's axes as well as the
    // collider's geometry. Keep a transformed fixed-force angle; radial forces are
    // recomputed from the already-transposed player/block positions.
    if (o.forceRadial !== undefined && !o.forceRadial) {
      var fa = (90 - (o.rot || 0) + (o.forceFlipY ? 180 : 0)) * Math.PI / 180;
      t.forceAngle = Math.atan2(Math.cos(fa), Math.sin(fa));
    }
    t.orig = o.orig || o;
    t._s = 0; t._aff = false;
    return t;
  }
  function transposeSim(lv) {
    var dyn = lv.dyn || null;
    if (lv._T && lv._TDyn === dyn) return lv._T;
    var keys = ['solids', 'spikes', 'portals', 'speeds', 'pads', 'orbs', 'slopes', 'coins', 'forceBlocks'];
    var T = { solids: [], spikes: [], portals: [], speeds: [], pads: [], orbs: [], slopes: [], coins: [], forceBlocks: [], triggers: lv.triggers || [], dyn: null, dynBase: {} };
    keys.forEach(function (k) {
      var sources = [];
      (lv[k] || []).forEach(function (o) { if (o !== GROUND && !o._aff) sources.push(o); });
      ((dyn && dyn[k]) || []).forEach(function (o) { sources.push(o); });
      sources.forEach(function (o) {
        if (k === 'slopes') {
          if (o.y0 === o.y1) {
            // flat: solid below the top edge at y0, spanning x0..x1 -> a wall block at x <= y0 spanning y0..y1
            var wall = transposeRec(o);
            wall.x0 = -1e9; wall.x1 = o.y0; wall.y0 = o.x0; wall.y1 = o.x1;
            wall.dir = undefined; wall.above = undefined;
            T.solids.push(wall);
            return;
          }
          var A = { x: o.y0, y: o.x0 }, B = { x: o.y1, y: o.x1 };
          if (A.x > B.x) { var tmp = A; A = B; B = tmp; }
          var s = transposeRec(o);
          s.x0 = A.x; s.y0 = A.y; s.x1 = B.x; s.y1 = B.y;
          s.dir = (B.y - A.y) >= 0 ? 1 : -1;
          s.above = s.dir > 0 ? !o.above : !!o.above;
          T.slopes.push(s);
          return;
        }
        T[k].push(transposeRec(o));
      });
    });
    GameSim.buildGrids(T);
    // buildGrids renumbers the ids; put back the ids of the original records (latches and coin indices use them)
    keys.forEach(function (k) { T[k].forEach(function (t) { t._id = (t.orig || t)._id; }); });
    T.dyn = { solids: [], spikes: [], portals: [], speeds: [], pads: [], orbs: [], slopes: [], coins: [], forceBlocks: [] };
    lv._T = T; lv._TDyn = dyn;
    return T;
  }
  var CELL = 30;
  var PORTAL_ROWS = 3;                            // portals are 3 blocks tall

  var DYN_KEYS = ['solids', 'spikes', 'portals', 'speeds', 'pads', 'orbs', 'slopes', 'coins', 'breakables', 'forceBlocks'];
  var KIND_MEMO = {};
  function kindOf(id) {
    var m = KIND_MEMO[id];
    if (m !== undefined) return m === 0 ? null : m;
    var k = kindOfRaw(id);
    KIND_MEMO[id] = k === null ? 0 : k;
    return k;
  }
  function kindOfRaw(id) {
    if (id === 2063) return 'checkpoint';
    if (FORCE_BLOCK[id]) return 'forceBlock';
    if (SLOPE[id]) return DECO_SLOPE[id] ? 'decor' : 'slope';
    if (SOLID[id] || defType(id) === 's') return 'solid';
    if (SPIKE[id]) return 'spike';
    if (HAZ[id]) return 'hazard';
    if (PORTAL[id]) return 'portal';
    if (EXIT[id]) return 'exit';
    if (SPEED_KEY[id]) return 'speed';
    if (PAD[id]) return 'pad';
    if (ORB[id]) return 'orb';
    if (COIN[id]) return 'coin';
    if (TRIG[id]) return 'trigger';
    if (FX[id]) return 'fx';
    if (DECO[id]) return 'deco';
    if (DECOR[id]) return 'decor';
    if (TEXT[id]) return 'text';
    if (typeof defType === 'function' && defType(id) === 'd') return 'decor';   // objdefs-only decos (3217/3218 ...)
    return null;
  }
  var FP_MEMO = {};
  function footprint(o) {
    var kind = kindOf(o.id);
    if (kind !== 'slope') {
      var fm = FP_MEMO[o.id];
      if (fm !== undefined) return fm;
      fm = footprintRaw(o, kind);
      FP_MEMO[o.id] = fm;
      return fm;
    }
    return footprintRaw(o, kind);
  }
  function footprintRaw(o, kind) {
    if (kind === 'fx') return { w: 0, h: 0 };
    if (kind === 'forceBlock') return gridOf(o.id) || { w: 1, h: 1 };
    if (kind === 'slope') {
      var w = SLOPE[o.id].gw, h = SLOPE[o.id].gh;
      // a quarter-turn rotation swaps the footprint box (rot 45/135 wedges keep it: drawn as walls)
      var rot = ((Math.round(o.rot || 0) % 360) + 360) % 360;
      var r90 = Math.round(rot / 90) % 4;
      if (r90 === 1 || r90 === 3) return { w: h, h: w };
      return { w: w, h: h };
    }
    if (kind === 'solid' && FOOT[o.id]) return FOOT[o.id];
    if (kind === 'solid' && gridOf(o.id)) return gridOf(o.id);      // half blocks and other fractional solids
    if ((kind === 'spike' || kind === 'hazard') && HBOX.grids[o.id]) return { w: HBOX.grids[o.id][0], h: HBOX.grids[o.id][1] };
    if (kind === 'hazard') return { w: HAZ[o.id].w, h: HAZ[o.id].h };
    if (kind === 'portal' || kind === 'exit' || kind === 'speed') {
      // GD stores the object's centre using its object-definition grid dimensions.
      // WD_GRIDS is a collision table rounded to whole pixels; using it here nudges
      // fractional-width portals and speed arrows away from their authored coordinates.
      var pg = gridOf(o.id), pgWd = WD_GRIDS[o.id];
      if (pg) return pg;
      if (pgWd) return { w: pgWd[0] / CELL, h: pgWd[1] / CELL };
      return { w: 1, h: PORTAL_ROWS };
    }
    // Use the exact GD object-definition footprint for pads, rings, coins and
    // decorations. WD_GRIDS is retained only as a fallback for entries missing a
    // definition; it is a rounded collision-size table, not the authoritative anchor.
    var grid = gridOf(o.id);
    var wd = WD_GRIDS[o.id];
    if (grid && (kind === 'pad' || kind === 'orb' || kind === 'coin' || kind === 'decor' || kind === 'deco')) return grid;
    if (wd && (kind === 'pad' || kind === 'orb' || kind === 'coin' || kind === 'decor' || kind === 'deco')) {
      return { w: wd[0] / CELL, h: wd[1] / CELL };
    }
    if (kind === 'text') return { w: 2, h: 1 };
    return { w: 1, h: 1 };
  }
  // effective slope: direction in the reference sense, and whether the solid is above (ceiling).
  // Derived exactly like the reference _createSlopeCollider: flip then rotate the three base
  // vertices (rising-right floor triangle), then read the walkable line's direction and which
  // side the right-angle corner (the solid) sits on. Half-turn wedges (45/135, Deadlocked)
  // land the hypotenuse on a centre line -> { flat: true } (approximated as a walkable line).
  function slopeOf(o) {
    var hw = SLOPE[o.id].gw / 2, hh = SLOPE[o.id].gh / 2;
    var vLo = { x: -hw, y: -hh }, vHi = { x: hw, y: hh }, vR = { x: hw, y: -hh };
    // per-id base direction (id 291's sprite falls right): mirror the base triangle first
    if (SLOPE[o.id].dir < 0) { vLo.x = -vLo.x; vHi.x = -vHi.x; vR.x = -vR.x; }
    var fx = o.flipX ? -1 : 1, fy = o.flipY ? -1 : 1;
    vLo.x *= fx; vHi.x *= fx; vR.x *= fx;
    vLo.y *= fy; vHi.y *= fy; vR.y *= fy;
    var rot = Math.round(o.rot || 0) % 360;
    if (rot !== 0) {
      var t = -rot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
      var rotp = function (p) { return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }; };
      vLo = rotp(vLo); vHi = rotp(vHi); vR = rotp(vR);
    }
    var dx = vHi.x - vLo.x, dy = vHi.y - vLo.y;
    if (Math.abs(dx) < 1e-6 || Math.abs(dy) < 1e-6) return { flat: true, dir: 1, above: false };
    var dir = dx * dy > 0 ? 1 : -1;
    var lineY = vLo.y + ((vR.x - vLo.x) / dx) * dy;
    var above = vR.y > lineY;                       // right-angle corner above the line: solid above
    return { dir: dir, above: above };
  }

  // reference _gdSlopeType / _gdSlopeSolidAbove / _gdSlopeWallOnLeft: the flat cap side and the
  // tall-end wall side, keyed by flipX/flipY/rot exactly like the reference table.
  function gdSlopeType(flipX, flipY, rotRaw) {
    var rot = (parseInt(rotRaw, 10) || 0) % 360;
    var fx = !!flipX, fy = !!flipY;
    var r0 = rot === 0;
    var r180 = Math.abs(rot) === 180;
    var r90 = rot === 90 || rot === -270;
    var r270 = rot === -90 || rot === 270;
    if (!fx && !fy) return r0 ? 0 : r90 ? 4 : r180 ? 3 : r270 ? 5 : null;
    if (!fx && fy) return r0 ? 1 : r90 ? 7 : r180 ? 2 : r270 ? 6 : null;
    if (fx && !fy) return r0 ? 2 : r90 ? 6 : r180 ? 1 : r270 ? 7 : null;
    return r0 ? 3 : r90 ? 5 : r180 ? 0 : r270 ? 4 : null;
  }
  function gdSlopeSolidAbove(type) { return type !== null && type < 7 && ((0x6a >> type) & 1) !== 0; }
  function gdSlopeWallOnLeft(type) { return type !== null && ((type - 2) >>> 0 < 3 || type === 6); }

  // effective draw layer / order (reference level.js: levelObj.zLayer || default_z_layer, zOrder likewise)
  function zOf(o, fallbackLayer) {
    var d = typeof OBJ_ZDEFAULTS !== 'undefined' ? OBJ_ZDEFAULTS[o.id] : null;
    return [o.zLayer || (d ? d[0] : (fallbackLayer || 0)), o.zOrder || (d ? d[1] : 0)];
  }

  // ---- model ----
  function Level(objs) { this.objs = objs || []; this.dirty = true; this.revision = 0; this._sim = null; this.platformer = false; }
  Level.prototype.touch = function () { this.dirty = true; this.revision++; };
  Level.prototype.covers = function (o, gx, gy) {
    var fp = footprint(o);
    return gx >= o.gx && gx < o.gx + fp.w && gy >= o.gy && gy < o.gy + fp.h;
  };
  // editing prefers solid objects; a decoration is only picked when nothing else is on the cell
  Level.prototype.at = function (gx, gy) {
    var decor = -1;
    for (var i = 0; i < this.objs.length; i++) {
      if (!this.covers(this.objs[i], gx, gy)) continue;
      if (kindOf(this.objs[i].id) !== 'decor') return i;
      if (decor < 0) decor = i;
    }
    return decor;
  };
  Level.prototype.remove = function (gx, gy) {
    var i = this.at(gx, gy);
    if (i >= 0) { this.objs.splice(i, 1); this.touch(); }
    return i >= 0;
  };
  // objects overlapping the footprint of the new one are replaced
  Level.prototype.place = function (id, gx, gy, flipX, flipY, opts) {
    if (gy < 0) return false;                       // the ground is not editable
    var fp = footprint({ id: id });
    for (var gx2 = gx; gx2 < gx + fp.w; gx2++) {
      for (var gy2 = gy; gy2 < gy + fp.h; gy2++) this.remove(gx2, gy2);
    }
    var o = { id: id, gx: gx, gy: gy, flipX: !!flipX, flipY: !!flipY };
    if (opts && opts.groups && opts.groups.length) o.groups = opts.groups.slice();
    if (opts && opts.p) o.p = opts.p;
    this.objs.push(o);
    this.touch();
    return true;
  };
  Level.prototype.clear = function () { this.objs = []; this.touch(); };
  Level.prototype.sim = function () {
    if (!this.dirty && this._sim) return this._sim;
    var lv = { solids: [GROUND], spikes: [], portals: [], speeds: [], pads: [], orbs: [], slopes: [], coins: [], triggers: [], colourTriggers: [], breakables: [], forceBlocks: [], checkpoints: [] };
    var entries = [], exits = [], maxGx = 0;
    this.objs.forEach(function (o) {
      if (o.gx > maxGx) maxGx = o.gx;                 // the finish line counts every object, broken or not
      if (o.broken) return;
      var kind = kindOf(o.id);
      var fp = footprint(o);
      var x0 = o.gx * CELL, y0 = o.gy * CELL, x1 = x0 + fp.w * CELL, y1 = y0 + fp.h * CELL;
      if (kind === 'fx' && COL_TRIG[o.id] && o.p) {
        // colour triggers keep their exact placement for the pass-over / touch rules
        lv.colourTriggers.push({ x0: x0, x1: x1, y0: y0, y1: y1, x: o.gx * CELL + fp.w * CELL / 2, p: o.p, groups: o.groups || [] });
        return;
      }
      if (kind === 'checkpoint') {
        lv.checkpoints.push({ id: o.id, x0: x0 + 2, x1: x1 - 2, y0: y0 + 2, y1: y1 - 2, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rawProps: o.rawProps || {} });
        return;
      }
      if (kind === 'trigger') {
        lv.triggers.push({ kind: TRIG[o.id], id: o.id, p: o.p || {}, groups: o.groups || [], left: x0, x: x0 + fp.w * CELL / 2, y: y0 + fp.h * CELL / 2, x0: x0 + 6, x1: x0 + fp.w * CELL - 6, y0: y0 + 6, y1: y0 + fp.h * CELL - 6 });
        return;
      }
      if (kind === 'fx') return;                     // recognised but inert: nothing to simulate or draw
      // grouped objects are routed to the dynamic list and placed each frame (see GameSim.refreshDyn)
      var L = lv;
      var grouped = !!(o.groups && o.groups.length);
      var lens = grouped ? { solids: L.solids.length, spikes: L.spikes.length, portals: L.portals.length, speeds: L.speeds.length, pads: L.pads.length, orbs: L.orbs.length, slopes: L.slopes.length, coins: L.coins.length, breakables: L.breakables.length, forceBlocks: L.forceBlocks.length } : null;
      if (kind === 'solid' && BREAKABLE[o.id]) {
        lv.breakables.push({ x0: x0, x1: x1, y0: y0, y1: y1, ref: o });
      } else if (kind === 'solid') {
        if (o.noTouch) { /* reference: no collider */ }
        else if (o.rot && (((o.rot % 90) + 90) % 90) !== 0) {
          // rotated solid (reference Collider with rotation): an oriented box; the axis-aligned bounds feed the grid
          var rcx = x0 + fp.w * CELL / 2, rcy = y0 + fp.h * CELL / 2;
          var rw = fp.w * CELL * (o.sx || 1), rh = fp.h * CELL * (o.sy || 1);
          var rrad = o.rot * Math.PI / 180, rcs = Math.abs(Math.cos(rrad)), rsn = Math.abs(Math.sin(rrad));
          var rex = (rw * rcs + rh * rsn) / 2, rey = (rw * rsn + rh * rcs) / 2;
          L.solids.push({ x0: rcx - rex, x1: rcx + rex, y0: rcy - rey, y1: rcy + rey, cx: rcx, cy: rcy, w: rw, h: rh, rot: o.rot, rotSolid: true });
        }
        else if (o.sx || o.sy) {
          var scx = x0 + fp.w * CELL / 2, scy = y0 + fp.h * CELL / 2;
          var sw = fp.w * CELL * (o.sx || 1) / 2, sh = fp.h * CELL * (o.sy || 1) / 2;
          if (((((o.rot || 0) % 180) + 180) % 180) === 90) { var swT = sw; sw = sh; sh = swT; }   // a quarter turn swaps the box
          L.solids.push({ x0: scx - sw, x1: scx + sw, y0: scy - sh, y1: scy + sh });
        } else L.solids.push({ x0: x0, x1: x1, y0: y0, y1: y1 });
      } else if (kind === 'spike' || kind === 'hazard') {
        // reference hitbox: centred on the object centre; [fullW, fullH] box or a circle radius
        var bx = HBOX.hb[o.id] || [6, 12];
        var hsx = o.sx || 1, hsy = o.sy || 1;
        if (bx.r !== undefined) bx = { r: bx.r * (hsx + hsy) / 2 }; else bx = [bx[0] * hsx, bx[1] * hsy];
        var hx = x0 + fp.w * CELL / 2, hy = y0 + fp.h * CELL / 2;
        if (bx.r !== undefined) L.spikes.push({ cx: hx, cy: hy, r: bx.r, rot: o.rot || 0, id: o.id });
        else L.spikes.push({ x0: hx - bx[0] / 2, x1: hx + bx[0] / 2, y0: hy - bx[1] / 2, y1: hy + bx[1] / 2, cx: hx, cy: hy, w: bx[0], h: bx[1], rot: o.rot || 0, id: o.id });
      } else if (kind === 'slope') {
        if (DECO_SLOPE[o.id]) {
          // reference: decoration slopes get no collider (level.js _createSlopeCollider)
        } else {
          var sl = slopeOf(o);
          var st = gdSlopeType(o.flipX, o.flipY, o.rot || 0);
          var wallLeft = gdSlopeWallOnLeft(st);
          var solidAbove = gdSlopeSolidAbove(st);
          if (sl.flat) {
            var cy = (y0 + y1) / 2;
            L.slopes.push({ x0: x0, x1: x1, y0: cy, y1: cy, dir: 1, above: false, wallLeft: wallLeft, solidAbove: solidAbove });
          } else {
            L.slopes.push({ x0: x0, x1: x1, y0: y0, y1: y1, dir: sl.dir, above: sl.above, wallLeft: wallLeft, solidAbove: solidAbove });
          }
        }
      } else if (kind === 'portal') {
        // portal collider (reference level.js): gridW*30 x gridH*30 centred on the object centre,
        // rotated with the object; teleport portals shift 15 units along the portal's facing axis
        var pg = WD_GRIDS[o.id] || [30, 90];
        var pcx = x0 + fp.w * CELL / 2, pcy = y0 + fp.h * CELL / 2;
        var pr = { cx: pcx, cy: pcy, w: pg[0], h: pg[1], rot: o.rot || 0, kind: PORTAL[o.id], target: pcy + 90 };
        if (o.tele !== undefined) pr.target = pcy + o.tele;   // key 54: custom teleport y offset
        if (PORTAL[o.id] === 'teleport') {
          // reference hitboxShift = -30 world units, teleport portals only; shift along the facing axis
          var rad = pr.rot * Math.PI / 180;
          pr.cx += Math.cos(rad) * 15;
          pr.cy -= Math.sin(rad) * 15;
        }
        L.portals.push(pr);
        if (PORTAL[o.id] === 'teleport') entries.push(pr);
      } else if (kind === 'exit') {
        exits.push({ gx: o.gx, centre: y0 + fp.h * CELL / 2 });
      } else if (kind === 'speed') {
        var sg = WD_GRIDS[o.id] || [30, 90];
        var scx = x0 + fp.w * CELL / 2, scy = y0 + fp.h * CELL / 2;
        L.speeds.push({ cx: scx, cy: scy, w: sg[0], h: sg[1], x0: scx - sg[0] / 2, x1: scx + sg[0] / 2, y0: scy - sg[1] / 2, y1: scy + sg[1] / 2, value: GameSim.SPEED[SPEED_KEY[o.id]] });
      } else if (kind === 'pad') {
        // reference pad collider: gridW*60 px centred on the object centre = gridW*30 world units
        // (the reference world runs at 2 px per unit); official levels embed pads at fractional
        // rows, e.g. Back On Track's y=2 ground pads
        var pdg = WD_GRIDS[o.id] || [CELL, 6];
        var pcx2 = x0 + fp.w * CELL / 2, pcy2 = y0 + fp.h * CELL / 2;
        L.pads.push({ x0: pcx2 - pdg[0] / 2, x1: pcx2 + pdg[0] / 2, y0: pcy2 - pdg[1] / 2, y1: pcy2 + pdg[1] / 2, id: o.id });
      } else if (kind === 'orb') {
        var og = WD_GRIDS[o.id] || [36, 36];
        L.orbs.push({ cx: x0 + fp.w * CELL / 2, cy: y0 + fp.h * CELL / 2, R: og[0] / 2, id: o.id, rot: o.rot || 0 });
      } else if (kind === 'coin') {
        var cg = WD_GRIDS[o.id] || [30, 30];
        L.coins.push({ cx: x0 + fp.w * CELL / 2, cy: y0 + fp.h * CELL / 2, R: cg[0] / 2, id: o.id });
      } else if (kind === 'forceBlock') {
        // Reference level.js: Force Blocks have a scaled, rotated rectangular collider,
        // are invisible at runtime, and are ignored when No Touch (k121) is enabled.
        if (!o.noTouch) {
          var fraw = o.rawProps || {};
          var fval = function (key, fallback) { var v = parseFloat(fraw['k' + key]); return isFinite(v) ? v : fallback; };
          var fcx = x0 + fp.w * CELL / 2, fcy = y0 + fp.h * CELL / 2;
          var fw = fp.w * CELL * (o.sx || 1), fh = fp.h * CELL * (o.sy || 1);
          var frot = o.rot || 0, frad = frot * Math.PI / 180;
          var fex = (Math.abs(Math.cos(frad)) * fw + Math.abs(Math.sin(frad)) * fh) / 2;
          var fey = (Math.abs(Math.sin(frad)) * fw + Math.abs(Math.cos(frad)) * fh) / 2;
          L.forceBlocks.push({
            id: o.id, cx: fcx, cy: fcy, w: fw, h: fh, rot: frot,
            x0: fcx - fex, x1: fcx + fex, y0: fcy - fey, y1: fcy + fey,
            force: fval(149, 0), forceMin: fval(526, 0), forceMax: fval(527, 0),
            forceRadial: fraw.k528 === '1', forceRange: fraw.k529 === '1',
            forceId: parseInt(fraw.k530 || '0', 10) || 0, forceFlipY: !!o.flipY,
            radius: Math.max(fw, fh) / 2
          });
        }
      }
      // tag the record this object just produced with its groups (dynamic objects only)
      if (grouped) DYN_KEYS.forEach(function (k) { if (L[k].length > lens[k]) L[k][L[k].length - 1].groups = o.groups.slice(); });
    });
    // teleport pairing (reference _normalizeTeleportPortals): each exit targets its nearest entry
    exits.forEach(function (ex) {
      var best = null, bestD = Infinity;
      entries.forEach(function (en) {
        var d = Math.abs(en.x0 / CELL - ex.gx);
        if (d < bestD) { bestD = d; best = en; }
      });
      if (best) best.target = ex.centre;
    });
    // ids for the dynamic records (kept apart from the static ids)
    var dynBase = {};
    ['solids', 'spikes', 'portals', 'speeds', 'pads', 'orbs', 'slopes', 'coins', 'breakables', 'forceBlocks'].forEach(function (k) {
      dynBase[k] = lv[k].filter(function (r) { return r.groups; });
      if (k === 'breakables') lv.breakables = lv.breakables.filter(function (r) { return !r.groups; });
    });
    lv.dynBase = dynBase;
    GameSim.buildGrids(lv);
    lv.dyn = { solids: [], spikes: [], portals: [], speeds: [], pads: [], orbs: [], slopes: [], coins: [], breakables: [], forceBlocks: [] };
    GameSim.refreshDyn(lv, function () { return { dx: 0, dy: 0, hidden: false, alpha: 1 }; });
    lv.solidsCount = lv.solids.length;
    lv.endX = (maxGx + 3) * CELL;
    this._sim = lv; this.dirty = false;
    return lv;
  };

  // ---- GD level string ----
  // GD centre convention: x = gx*30 + w*15, y = gy*30 + h*15 (row 0 sits directly on the ground, top at y = 0).
  function gdObjects(level) {
    return level.objs.map(function (o) {
      var fp = footprint(o);
      // GD stores positions to 3 decimals; writing them the same way keeps float noise out of the file
      var x = Math.round((o.gx * CELL + fp.w * CELL / 2) * 1000) / 1000, y = Math.round((o.gy * CELL + fp.h * CELL / 2) * 1000) / 1000;
      var s = '1,' + o.id + ',2,' + x + ',3,' + y;
      if (o.flipX) s += ',4,1';
      if (o.flipY) s += ',5,1';
      if (o.rot) s += ',6,' + o.rot;
      if (o.col) s += ',21,' + o.col;
      if (o.col2) s += ',22,' + o.col2;
      if (o.scale !== undefined && o.scale !== 1) s += ',32,' + o.scale;
      if (o.editorLayer !== undefined && o.editorLayer !== 0) s += ',20,' + o.editorLayer;
      if (o.zLayer !== undefined && o.zLayer !== 0) s += ',24,' + o.zLayer;
      if (o.zOrder !== undefined && o.zOrder !== 0) s += ',25,' + o.zOrder;
      if (o.tele !== undefined) s += ',54,' + o.tele;
      if (o.editorLayer2 !== undefined && o.editorLayer2 !== 0) s += ',61,' + o.editorLayer2;
      if (o.groups && o.groups.length) s += ',57,' + o.groups.join('.');
      if (TEXT[o.id] && o.text !== undefined) s += ',31,' + bytesToB64url(fflate.strToU8(o.text));
      if (o.p && TRIG[o.id]) {
        var p = o.p, t = TRIG[o.id];
        s += ',51,' + (p.target || 0) + ',10,' + (p.dur === undefined ? 0 : p.dur);
        if (t === 'move' || t === 'camoffset') s += ',28,' + (p.dx || 0) + ',29,' + (p.dy || 0) + ',30,' + (p.easingType || 0) + ',85,' + (p.easingRate === undefined ? 2 : p.easingRate);
        if (t === 'alpha') s += ',35,' + (p.opacity === undefined ? 1 : p.opacity) + ',30,' + (p.easingType || 0) + ',85,' + (p.easingRate === undefined ? 2 : p.easingRate);
        if (t === 'toggle') s += ',56,' + (p.activate ? 1 : 0);
        if (t === 'spawn') s += ',63,' + (p.delay || 0);
        if (t === 'rotategp') s += ',166,' + (p.ground || 2) + ',167,' + (p.move || 4) + (p.changeChannel ? ',171,1,173,' + (p.targetChannel || 0) : '') + (p.channelOnly ? ',172,1' : '') + (p.realTouch ? ',11,1' : '');
        if (t !== 'rotategp' && p.channel) s += ',170,' + p.channel + (p.ord ? ',115,' + p.ord : '');
        if (t === 'camrot') s += ',68,' + (p.degrees || 0) + ',70,' + (p.add ? 1 : 0);
        if (t === 'zoom') s += ',371,' + (p.zoom === undefined ? 1 : p.zoom) + ',30,' + (p.easingType || 0) + ',85,' + (p.easingRate === undefined ? 2 : p.easingRate);
        if (t === 'static') s += ',71,' + (p.target || 0) + ',110,' + (p.exit ? 1 : 0);
        if (t === 'static') s += ',212,' + (p.follow ? 1 : 0) + ',213,' + (p.followEasing || 1) + ',453,' + (p.smoothVelocity ? 1 : 0) + ',454,' + (p.smoothVelocityMod === undefined ? 1 : p.smoothVelocityMod) + ',465,' + (p.exitInstant ? 1 : 0) + ',30,' + (p.easingType || 0) + ',85,' + (p.easingRate === undefined ? 2 : p.easingRate);
        if (t === 'camrot') s += ',394,' + (p.snap360 ? 1 : 0) + ',30,' + (p.easingType || 0) + ',85,' + (p.easingRate === undefined ? 2 : p.easingRate);
        if (t === 'cameraEdge') s += ',164,' + (p.edge || 0);
        if (t === 'cameraMode') s += ',111,' + (p.freeMode ? 1 : 0) + ',112,' + (p.editSettings ? 1 : 0) + ',113,' + (p.easing || 1) + ',114,' + (p.padding || 0);
        if (t === 'event') s += ',447,' + (p.extraId || 0) + ',525,' + (p.player || 0) + ',430,' + (p.eventRaw || (p.events || []).join('.'));
        if (t === 'zoom' || t === 'static' || t === 'camoffset') s += ',101,' + (p.axis || 0);
        if (t === 'rotate') s += ',68,' + (p.degrees || 0) + ',69,' + (p.times360 || 0) + ',70,' + (p.lockRotation ? 1 : 0) + ',71,' + (p.centerGroup || 0) + ',30,' + (p.easingType || 0) + ',85,' + (p.easingRate === undefined ? 2 : p.easingRate);
        if (t === 'pulse') s += ',52,' + (p.targetType || 0) + ',7,' + (p.r === undefined ? 255 : p.r) + ',8,' + (p.g === undefined ? 255 : p.g) + ',9,' + (p.b === undefined ? 255 : p.b) + ',45,' + (p.fadeIn || 0) + ',46,' + (p.hold || 0) + ',47,' + (p.fadeOut || 0);
        if (t === 'gravity') s += ',148,' + (p.gravity === undefined ? 1 : p.gravity) + (p.p1 === false ? ',200,1' : '') + (p.p2 === false ? ',201,1' : '');
        if (t === 'playerControl') {
          s += ',540,' + (p.stopJump ? 1 : 0) + ',541,' + (p.stopMove ? 1 : 0) + ',542,' + (p.stopRotate ? 1 : 0) + ',543,' + (p.stopSlide ? 1 : 0);
          // Preserve the player filters encoded by the reference k138/k200 pair.
          if (p.p1 === false) s += ',200,1';
          else if (p.p2 === false) s += ',138,1';
        }
        if (t === 'timewarp') s += ',120,' + (p.timeMod === undefined ? 1 : p.timeMod);
        if (t === 'teleport') {
          s += ',354,' + (p.gravityMode || 0) + ',352,' + (p.usePlayerX ? 1 : 0) + ',353,' + (p.usePlayerY ? 1 : 0) + ',443,' + (p.noEffects ? 1 : 0);
          if (p.teleportY !== undefined && p.teleportY !== null) s += ',54,' + p.teleportY;
        }
        if (t === 'end') s += ',460,' + (p.noEffects ? 1 : 0) + ',461,' + (p.noSFX ? 1 : 0) + ',487,' + (p.instant ? 1 : 0);
        if (p.touch) s += ',11,1';
        if (p.multiTrigger) s += ',87,1';
        if (p.delay && t !== 'spawn') s += ',63,' + p.delay;
      } else if (o.id === 2016 && o.p) {
        s += ',28,' + (o.p.dx || 0) + ',29,' + (o.p.dy || 0) + ',371,' + (o.p.zoom || 1) + ',506,' + (o.p.previewOpacity === undefined ? 1 : o.p.previewOpacity);
      } else if (o.p && COL_TRIG[o.id]) {
        var cp = o.p;
        if (o.id !== 29 && o.id !== 30) s += ',23,' + (cp.channel || 0);
        s += ',7,' + (cp.r === undefined ? 255 : cp.r) + ',8,' + (cp.g === undefined ? 255 : cp.g) + ',9,' + (cp.b === undefined ? 255 : cp.b) + ',10,' + (cp.dur || 0);
        if (cp.op !== undefined && cp.op !== 1) s += ',35,' + cp.op;
        if (cp.touch) s += ',11,1';
      }
      if (o.rawProps && (o.id === 2016 || o.id === 2063 || FORCE_BLOCK[o.id])) {
        var skipRaw = { 1:1,2:1,3:1,4:1,5:1,6:1,20:1,21:1,22:1,24:1,25:1,31:1,32:1,33:1,54:1,57:1,61:1 };
        if (o.id === 2016) { skipRaw[28]=1; skipRaw[29]=1; skipRaw[371]=1; skipRaw[506]=1; }
        Object.keys(o.rawProps).forEach(function (key) { var n = parseInt(key.slice(1), 10); if (n > 0 && !skipRaw[n]) s += ',' + n + ',' + o.rawProps[key]; });
      }
      return s;
    }).join(';');
  }
  function colorParts(value) {
    var s = String(value || '').trim(), m;
    if ((m = s.match(/^#([0-9a-f]{3})$/i))) {
      return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    }
    if ((m = s.match(/^#([0-9a-f]{6})$/i))) {
      return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    }
    if ((m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i))) return [+m[1], +m[2], +m[3]];
    return null;
  }
  function serialize(level) {
    var header = [], palette = level.palette || {}, entries = [], legacy = {};
    var channels = Object.keys(palette).sort(function (a, b) { return (+a) - (+b); });
    channels.forEach(function (channel) {
      var rgb = colorParts(palette[channel]);
      if (!rgb) return;
      var n = parseInt(channel, 10);
      if (n === 1000) legacy[29] = rgb;
      else if (n === 1001) legacy[30] = rgb;
      entries.push('1_' + rgb[0] + '_2_' + rgb[1] + '_3_' + rgb[2] + '_4_0_6_' + n + '_7_1');
    });
    Object.keys(legacy).forEach(function (key) {
      var c = legacy[key];
      header.push('kS' + key + ',1_' + c[0] + '_2_' + c[1] + '_3_' + c[2]);
    });
    if (entries.length) header.push('kS38,' + entries.join('|'));
    if (level.bgId !== undefined && level.bgId !== null) header.push('kA6,' + (parseInt(level.bgId, 10) || 1));
    if (level.groundId !== undefined && level.groundId !== null) header.push('kA7,' + (parseInt(level.groundId, 10) || 1));
    if (level.platformer) header.push('kA22,1');
    header.push('kS1');
    return header.join(';') + ';' + gdObjects(level) + ';';
  }

  var NO_GROUPS = [];
  var FP_SCRATCH = { id: 0 };
  function parseObjectString(s) {
    var parts = s.split(','), d = {};
    for (var i = 0; i + 1 < parts.length; i += 2) d['k' + parts[i]] = parts[i + 1];
    return d;
  }
  // decoded level string -> model. Unknown ids are dropped and counted in `skipped`.
  function fromDecoded(decoded, opts) {
    var convertDeco = !(opts && opts.convertDeco === false);
    var parts = decoded.split(';'), objs = [], skipped = {}, n = 0, converted = 0;
    // colour channels from the header (kS29 = channel 1, kS30 = channel 2, ...), e.g. kS29,1_40_2_62_3_255
    var LEGACY_HEADER = { 29: 1000, 30: 1001, 31: 1002, 32: 1004, 33: 1, 34: 2, 35: 3, 36: 4, 37: 1003 };
    var palette = {}, pm, palRe = /kS(\d+),1_(\d+)_2_(\d+)_3_(\d+)/g;
    while ((pm = palRe.exec(decoded)) !== null) {
      // kS29 = background (1000), kS30 = ground (1001), kS31..kS37 = 1002..1008 (1004 = default white)
      // Web Dashers' legacy header table: kS29 BG, kS30 G1, kS31 G2, kS32 default object colour, kS33..kS36 P1..P4, kS37 line
      var hk = parseInt(pm[1], 10), chn = LEGACY_HEADER[hk] || -1;
      if (chn > 0) palette[chn] = 'rgb(' + pm[2] + ',' + pm[3] + ',' + pm[4] + ')';
    }
    // 2.2 levels (Geometrical Dominator, Deadlocked, Fingerdash) carry kS38/kS39 instead:
    // a list of colour entries `1_r_2_g_3_b_4_copy_6_channel_7_opacity_...` separated by '|'.
    // Channel ids stay the raw GD ids (1000 BG, 1001 G1, 1002 line, 1003 obj2, 1004 obj,
    // 1005/1006 legacy P1/P2, 1/2 the 2.2 P1/P2, ...): remapping 1005 onto 1 would let the
    // legacy green entry overwrite the real P1 colour (Fingerdash: 1 = dark red, 1005 = green).
    var ks38 = decoded.match(/kS38,([^;]*)/);
    if (ks38) {
      var chans = {};
      ks38[1].split('|').forEach(function (entry) {
        var f = {};
        var toks = entry.split('_');
        for (var ti = 0; ti + 1 < toks.length; ti += 2) f[toks[ti]] = toks[ti + 1];
        var id = parseInt(f['6'], 10);
        if (!id) return;
        var r = parseInt(f['1'] || '255', 10), g = parseInt(f['2'] || '255', 10), b = parseInt(f['3'] || '255', 10);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return;
        chans[id] = [r, g, b];
      });
      Object.keys(chans).forEach(function (cid) {
        palette[parseInt(cid, 10)] = 'rgb(' + chans[cid].join(',') + ')';
      });
    }
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i] || parts[i].indexOf(',') < 0) continue;
      var d = parseObjectString(parts[i]);
      var id = parseInt(d.k1 || '0', 10);
      if (!id) continue;
      // GD 2.0 renumbered the pixel-art decos 717/718 into 3217/3218; 1.9 files (Blast
      // Processing, ToE 2) still carry the raw ids
      if (id === 717 || id === 718) id += 2500;
      n++;
      var kind = kindOf(id);
      if (!kind) { skipped[id] = (skipped[id] || 0) + 1; continue; }
      var objectRotation = parseFloat(d.k6 || '0') || 0;
      FP_SCRATCH.id = id;
      FP_SCRATCH.rot = objectRotation;
      var fp = footprint(FP_SCRATCH);
      var x = parseFloat(d.k2 || '0'), y = parseFloat(d.k3 || '0');
      // exact position: GD objects are not required to sit on the 30-unit grid (Polargeist, official levels)
      var gx = (x - fp.w * CELL / 2) / CELL;
      var gy = (y - fp.h * CELL / 2) / CELL;
      // no cut-off below y = 0: GD hazards and saws sit half-embedded in the ground at fractional rows
      if (isNaN(gx) || isNaN(gy)) continue;
      if (kind === 'deco' && convertDeco) {
        converted++;
        for (var dx = 0; dx < fp.w; dx++) for (var dy = 0; dy < fp.h; dy++) objs.push({ id: 1, gx: Math.round(gx) + dx, gy: Math.round(gy) + dy, flipX: false, flipY: false });
        continue;
      }
      var grpRaw = [];
      if (d.k33) grpRaw = grpRaw.concat(d.k33.split('.'));
      if (d.k57) grpRaw = grpRaw.concat(d.k57.split('.'));
      var grp = grpRaw.map(Number).filter(function (n, idx, all) { return n > 0 && all.indexOf(n) === idx; });
      var rec = { id: id, gx: gx, gy: gy, flipX: d.k4 === '1', flipY: d.k5 === '1' };
      if (d.k6) rec.rot = objectRotation;          // rotation in degrees, clockwise on screen
      var uniScale = d.k32 !== undefined ? parseFloat(d.k32) : NaN;
      var scaleXv = d.k128 !== undefined ? parseFloat(d.k128) : uniScale;
      var scaleYv = d.k129 !== undefined ? parseFloat(d.k129) : uniScale;
      if (isFinite(scaleXv) && scaleXv !== 0 && Math.abs(scaleXv) !== 1) rec.sx = Math.abs(scaleXv);
      if (isFinite(scaleYv) && scaleYv !== 0 && Math.abs(scaleYv) !== 1) rec.sy = Math.abs(scaleYv);
      if (d.k135 === '1') rec.hidden = true;       // reference: the sprite is hidden (the collider stays)
      if (d.k121 === '1') rec.noTouch = true;      // reference: no collider
      if (d.k21) rec.col = parseInt(d.k21, 10) || 0;      // base colour channel
      if (d.k22) rec.col2 = parseInt(d.k22, 10) || 0;     // detail colour channel (reference detailChannel)
      // legacy 1.9 colour key k19 maps to a modern channel and clears the detail channel
      var l19 = LEGACY19[parseInt(d.k19 || '0', 10)];
      if (l19 !== undefined) { rec.col = l19; rec.col2 = 0; }
      if (d.k32) rec.scale = parseFloat(d.k32) || 1;
      if (d.k20) rec.editorLayer = parseInt(d.k20, 10) || 0;
      if (d.k24) rec.zLayer = parseInt(d.k24, 10) || 0;
      if (d.k25) rec.zOrder = parseInt(d.k25, 10) || 0;
      if (d.k61) rec.editorLayer2 = parseInt(d.k61, 10) || 0;
      if (d.k54 !== undefined && kind === 'portal') rec.tele = parseFloat(d.k54) || 0;   // teleport portal y offset (key 54)
      if (grp.length) rec.groups = grp.slice();
      if (TRIG[id]) {
        rec.p = { target: parseInt(d.k51 || '0', 10), dur: d.k10 === undefined ? 0 : (parseFloat(d.k10) || 0),
          dx: parseFloat(d.k28 || '0') || 0, dy: parseFloat(d.k29 || '0') || 0,
          opacity: d.k35 === undefined ? 1 : parseFloat(d.k35), activate: d.k56 === '1' ? 1 : 0,
          touch: d.k11 === '1', multiTrigger: d.k87 === '1', delay: parseFloat(d.k63 || '0') || 0,
          easingType: parseInt(d.k30 || '0', 10) || 0, easingRate: d.k85 === undefined ? 2 : (parseFloat(d.k85) || 0) };
        if (id === 2066) {
          var gravityValue = d.k148 === undefined ? 1 : parseFloat(d.k148);
          if (!isFinite(gravityValue)) gravityValue = 1;
          rec.p.gravity = Math.max(0.1, Math.min(2, gravityValue));
          rec.p.p1 = d.k200 !== '1';
          rec.p.p2 = d.k138 !== '1' && d.k201 !== '1';
        } else if (id === 1932) {
          rec.p.stopJump = d.k540 === '1';
          rec.p.stopMove = d.k541 === '1';
          rec.p.stopRotate = d.k542 === '1';
          rec.p.stopSlide = d.k543 === '1';
          rec.p.p1 = d.k138 === '1' || d.k200 !== '1';
          rec.p.p2 = d.k138 !== '1' || d.k200 === '1';
        } else if (id === 1935) {
          var timeModValue = d.k120 === undefined ? 1 : parseFloat(d.k120);
          if (!isFinite(timeModValue)) timeModValue = 1;
          rec.p.timeMod = Math.max(0.1, Math.min(2, timeModValue));
        } else if (id === 3022) {
          rec.p.gravityMode = Math.max(0, Math.min(3, parseInt(d.k354 || '0', 10) || 0));
          var teleportYValue = d.k54 === undefined ? NaN : parseFloat(d.k54);
          rec.p.teleportY = isFinite(teleportYValue) ? teleportYValue : null;
          rec.p.usePlayerX = d.k352 === '1';
          rec.p.usePlayerY = d.k353 === '1';
          rec.p.noEffects = d.k443 === '1';
        } else if (id === 3600) {
          rec.p.noEffects = d.k460 === '1';
          rec.p.noSFX = d.k461 === '1';
          rec.p.instant = d.k487 === '1';
        } else if (id === 1914) {
          rec.p.follow = d.k212 === '1';
          rec.p.followEasing = Math.max(0.1, parseFloat(d.k213 || '1') || 1);
          rec.p.smoothVelocity = d.k453 === '1';
          rec.p.smoothVelocityMod = d.k454 === undefined ? 1 : (parseFloat(d.k454) || 0);
          rec.p.exitInstant = d.k465 === '1';
        } else if (id === 2015) {
          rec.p.snap360 = d.k394 === '1';
          rec.p.easingType = parseInt(d.k30 || '0', 10) || 0;
          rec.p.easingRate = d.k85 === undefined ? 2 : (parseFloat(d.k85) || 2);
        } else if (id === 2062) {
          rec.p.edge = parseInt(d.k164 || '0', 10) || 0;
        } else if (id === 2925) {
          rec.p.freeMode = d.k111 === '1';
          rec.p.editSettings = d.k112 === '1';
          rec.p.easing = Math.max(1, Math.min(40, parseFloat(d.k113 || '1') || 1));
          rec.p.padding = Math.max(0, Math.min(1, parseFloat(d.k114 || '0') || 0));
        } else if (id === 3604) {
          rec.p.extraId = parseInt(d.k447 || '0', 10) || 0;
          rec.p.player = Math.max(0, Math.min(2, parseInt(d.k525 || '0', 10) || 0));
          rec.p.eventRaw = d.k430 || '';
          rec.p.events = String(rec.p.eventRaw).split(/[.|]/).map(Number).filter(function (v) { return isFinite(v) && v >= 0; });
        }
        if (TRIG[id]) { rec.p.channel = parseInt(d.k170 || '0', 10) || 0; rec.p.ord = parseInt(d.k115 || '0', 10) || 0; }   // trigger channel and order (reference 170, 115)
        if (id === 2900) {                                   // rotate gameplay (reference rotateGameplay): touch-triggered
          rec.p.ground = parseInt(d.k166 || '2', 10) || 2;
          rec.p.move = parseInt(d.k167 || '4', 10) || 4;
          rec.p.touch = true;
          rec.p.realTouch = d.k11 === '1';
          rec.p.changeChannel = d.k171 === '1';
          rec.p.targetChannel = parseInt(d.k173 || '0', 10) || 0;
          rec.p.channelOnly = d.k172 === '1';
        }
        if (id === 2015) {                                   // camera rotate (reference cameraRotate)
          rec.p.degrees = parseFloat(d.k68 || '0') || 0;
          rec.p.add = d.k70 === '1';
        }
        if (id === 1913) {                                   // camera zoom (reference cameraZoom)
          rec.p.zoom = Math.max(0.4, Math.min(3, parseFloat(d.k371 || '1') || 1));
          rec.p.easingType = parseInt(d.k30 || '0', 10) || 0;
          rec.p.easingRate = d.k85 === undefined ? 2 : (parseFloat(d.k85) || 2);
        }
        if (id === 1914) {                                   // static camera (reference staticCamera)
          rec.p.target = parseInt(d.k71 || '0', 10) || 0;
          rec.p.exit = d.k110 === '1';
          rec.p.easingType = parseInt(d.k30 || '0', 10) || 0;
          rec.p.easingRate = d.k85 === undefined ? 2 : (parseFloat(d.k85) || 2);
        }
        if (id === 1913 || id === 1914 || id === 1916) rec.p.axis = parseInt(d.k101 || '0', 10) || 0;
        if (id === 1346) {
          rec.p.degrees = parseFloat(d.k68 || '0') || 0;
          rec.p.times360 = parseInt(d.k69 || '0', 10) || 0;
          rec.p.lockRotation = d.k70 === '1';
          rec.p.centerGroup = parseInt(d.k71 || '0', 10) || 0;
          rec.p.easingType = parseInt(d.k30 || '0', 10) || 0;
          rec.p.easingRate = d.k85 === undefined ? 2 : (parseFloat(d.k85) || 0);
        } else if (id === 1006) {
          rec.p.targetType = parseInt(d.k52 || '0', 10) || 0;
          rec.p.targetGroup = rec.p.targetType === 1 ? rec.p.target : 0;
          rec.p.targetChannel = rec.p.targetType === 0 ? rec.p.target : 0;
          rec.p.r = parseInt(d.k7 || '255', 10);
          rec.p.g = parseInt(d.k8 || '255', 10);
          rec.p.b = parseInt(d.k9 || '255', 10);
          rec.p.fadeIn = parseFloat(d.k45 || '0') || 0;
          rec.p.hold = parseFloat(d.k46 || '0') || 0;
          rec.p.fadeOut = parseFloat(d.k47 || '0') || 0;
        } else if (SHADER_FX[id]) {
          // reference _parseShaderTrigger: value keys 175/176/179/180/189/191 + 512 (max dist),
          // booleans 184-194 + 513/514/515, centre group 71, layers 196/197, p1/p2 138/200
          rec.p.fx = SHADER_FX[id];
          rec.p.v175 = parseFloat(d.k175 || '0') || 0;
          rec.p.v176 = parseFloat(d.k176 || '0') || 0;
          rec.p.v179 = parseFloat(d.k179 || '0') || 0;
          rec.p.v180 = parseFloat(d.k180 || '0') || 0;
          rec.p.v189 = parseFloat(d.k189 || '0') || 0;
          rec.p.v191 = parseFloat(d.k191 || '0') || 0;
          rec.p.v512 = parseFloat(d.k512 || '0') || 0;
          rec.p.v290 = parseFloat(d.k290 || '0') || 0;
          rec.p.v291 = parseFloat(d.k291 || '0') || 0;
          rec.p.b184 = d.k184 === '1';
          rec.p.b185 = d.k185 === '1';
          rec.p.b186 = d.k186 === '1';
          rec.p.b187 = d.k187 === '1';
          rec.p.b188 = d.k188 === '1';
          rec.p.b190 = d.k190 === '1';
          rec.p.b192 = d.k192 === '1';
          rec.p.b194 = d.k194 === '1';
          rec.p.b513 = d.k513 === '1';
          rec.p.b514 = d.k514 === '1';
          rec.p.p1 = d.k138 === '1';
          rec.p.p2 = d.k200 === '1';
          rec.p.centerGroup = parseInt(d.k71 || '0', 10) || 0;
          rec.p.layerMin = parseInt(d.k196 || '0', 10) || 0;
          rec.p.layerMax = parseInt(d.k197 || '0', 10) || 0;
        }
      } else if (id === 2016) {
        rec.p = { dx: parseFloat(d.k28 || '0') || 0, dy: parseFloat(d.k29 || '0') || 0, zoom: parseFloat(d.k371 || '1') || 1, previewOpacity: d.k506 === undefined ? 1 : (parseFloat(d.k506) || 0) };
        rec.rawProps = d;
      } else if (kind === 'checkpoint' || kind === 'forceBlock') {
        rec.rawProps = d;
        if (kind === 'forceBlock' && d.k121 === '1') rec.noTouch = true;
      } else if (TEXT[id]) {
        var tval = d.k31 || '';
        try { tval = fflate.strFromU8(b64urlToBytes(tval)); }
        catch (te) { /* keep the raw value when it is not base64 */ }
        rec.text = tval;
      } else if (COL_TRIG[id]) {
        // colour triggers: 29 = background (1000), 30 = ground (1001), legacy ids pick their
        // channel from k23 with the reference LEGACY_COLOR_TRIGGER_CHANNELS default.
        // Colour at k7/k8/k9, duration k10, copy channel k50, HSV k49, blending k17.
        var chn = id === 29 ? 1000 : id === 30 ? 1001 : (parseInt(d.k23 || '0', 10) || COL_TRIG_DEF[id] || 0);
        if (chn > 0) {
          var hsvParts = null;
          if (d.k49) {
            // reference parseChannelHsv: "h a s a v a sAdd a vAdd"
            var hp = String(d.k49).split('a');
            var hn = function (i, fb) { var n = parseFloat(hp[i]); return isFinite(n) ? n : fb; };
            hsvParts = { h: hn(0, 0), s: hn(1, 1), v: hn(2, 1), sAdd: hp[3] === '1', vAdd: hp[4] === '1' };
          }
          rec.p = { channel: chn,
            r: parseInt(d.k7 || '255', 10), g: parseInt(d.k8 || '255', 10), b: parseInt(d.k9 || '255', 10),
            dur: parseFloat(d.k10 || '0') || 0, touch: d.k11 === '1',
            op: d.k35 === undefined ? 1 : parseFloat(d.k35),
            copy: parseInt(d.k50 || '0', 10) || 0, hsv: hsvParts, blending: d.k17 === '1' };
        }
      }
      objs.push(rec);
      if (kind === 'fx') continue;                   // inert object, exact position kept
    }
    // later objects replace earlier ones that cover the same cell (decorations are never replaced)
    var clean = new Level(objs);
    clean.palette = palette;
    clean.platformer = /(?:^|;)kA22,1(?:;|$)/.test(decoded);
    // background / ground texture selection (reference getBackgroundDisplayId / getGroundTextureId:
    // kA6/kA7 <= 1 mean texture 1) — consumed by the renderer's tiled bg / ground
    var a6 = decoded.match(/kA6,(\d+)/), a7 = decoded.match(/kA7,(\d+)/);
    clean.bgId = a6 ? (parseInt(a6[1], 10) || 1) : 1;
    clean.groundId = a7 ? (parseInt(a7[1], 10) || 1) : 1;
    // reference level.js _legacyColorLevel: kS29 set without the 2.x flag kS38 — the legacy
    // 1002 line channel renders additive on such levels
    clean.legacyColor = /kS29,/.test(decoded) && !/kS38,/.test(decoded);
    return { level: clean, total: n, skipped: skipped, converted: converted };
  }

  function b64urlToBytes(s) {
    var b = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var bin = atob(b), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function bytesToB64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // .gmd plist, bare compressed level string, or decoded 'kS...;obj;obj' text
  function importText(text, opts) {
    var t = String(text || '').trim();
    var m = t.match(/<k>k4<\/k>\s*<s>([^<]*)<\/s>/) || t.match(/<key>k4<\/key>\s*<string>([^<]*)<\/string>/);
    var name = (t.match(/<k>k2<\/k>\s*<s>([^<]*)<\/s>/) || t.match(/<key>k2<\/key>\s*<string>([^<]*)<\/string>/) || [, ''])[1];
    if (m) t = m[1];
    var decoded = null;
    if (/^kS/.test(t) || /^[0-9]+,[0-9]+/.test(t) || (t.indexOf(',') >= 0 && t.indexOf(';') >= 0)) {
      decoded = t;
    } else {
      try {
        // official levels are gzip (1f 8b magic); pasted level strings are zlib (fflate handles both).
        var bytes = b64urlToBytes(t);
        var raw = (bytes[0] === 0x1f && bytes[1] === 0x8b) ? fflate.gunzipSync(bytes) : fflate.unzlibSync(bytes);
        decoded = fflate.strFromU8(raw);
      }
      catch (e) { throw new Error('Could not decode this level data: ' + e.message); }
    }
    var res = fromDecoded(decoded, opts);
    res.name = name;
    return res;
  }

  function exportLevelString(level) { return bytesToB64url(fflate.zlibSync(fflate.strToU8(serialize(level)))); }
  function exportGmd(level, name) {
    var nm = (name || 'Rhythm Runner level').replace(/[<&]/g, '');
    return '<?xml version="1.0"?>\n<plist version="1.0" gjver="2.0"><dict>\n' +
      '<k>kCEK</k><i>4</i>\n<k>k2</k><s>' + nm + '</s>\n<k>k4</k><s>' + exportLevelString(level) + '</s>\n' +
      '</dict></plist>';
  }

  function fromTemplate(list) {
    var lvl = new Level([]);
    list.forEach(function (t) { lvl.place(t[0], t[1], t[2], !!t[3], !!t[4]); });
    // same defaults as importText when kA6/kA7 are absent: background and ground texture 1
    lvl.bgId = 1; lvl.groundId = 1;
    return lvl;
  }

  return {
    kindOf: kindOf, footprint: footprint, Level: Level, fromTemplate: fromTemplate,
    DECO_SLOPE: DECO_SLOPE,
    zOf: zOf, importText: importText, exportGmd: exportGmd, exportLevelString: exportLevelString,
    serialize: serialize, PORTAL: PORTAL, SPEED_KEY: SPEED_KEY, FOOT: FOOT, SLOPE: SLOPE,
    PORTAL_ROWS: PORTAL_ROWS, slopeOf: slopeOf, HAZ: HAZ, transposeSim: transposeSim
  };
})();
