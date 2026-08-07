-- ============================================================================
-- 新医院医保目录对照初始化 SQL
-- 源表：df_zhushuju.gy_shoufeixm (guojiaxmdm 已维护)
--       df_yaokufang.gy_yaopinmccd (guojiaypbm 已维护)
-- 目标：df_yibao.yb_zhenliaodmdz (诊疗目录对照)
--       df_yibao.yb_yaopindmdz   (药品目录对照)
-- ============================================================================

-- >>> 请根据新医院实际情况修改以下参数 <<<
-- :YILIAOBXID  = 医保保险ID（从 yb_yibaobxxz 或医保配置获取，如 '105'）
-- :YIBAOZCBH   = 医保注册编号（通常为 1）
-- :YUANQUID    = 院区ID
-- :TENANTID    = 租户ID（新医院默认 '0'，多租户按实际填写）


-- ============================================================================
-- 1. 诊疗目录对照：gy_shoufeixm -> yb_zhenliaodmdz
--    条件：guojiaxmdm 已维护（非空非空串），且收费项目未作废
-- ============================================================================
INSERT INTO df_yibao.yb_zhenliaodmdz (
    yiliaobxid,
    yibaozcbh,
    yiyuanylxh,
    renyuanlbdm,
    yibaozldm,
    yibaojyhm,
    yiyuandzdm,
    yiyuanzlmc,
    yiyuanzldwmc,
    duizhaofs,
    duizhaoqyrq,
    duizhaozzrq,
    yibaoshjg,
    zhenliaoyppb,
    zidianjlxh,
    guojiabm,
    shuruma,
    shengma,
    shangchuanrq,
    shangchuanren,
    chuangjianren,
    chuangjiansj,
    chuangjianrenxm,
    zuofeibz,
    yuanquid,
    tenantid
)
SELECT
    '105'                                 AS yiliaobxid,       -- <<< 修改为新医院医保ID
    1                                     AS yibaozcbh,        -- <<< 修改为实际注册编号
    s.shoufeixmid                         AS yiyuanylxh,       -- 医院诊疗序号 = 收费项目ID
    '*'                                   AS renyuanlbdm,      -- 人员类别（默认全部）
    s.guojiaxmdm                          AS yibaozldm,        -- 医保诊疗代码 = 国家项目代码
    NULL                                  AS yibaojyhm,        -- 医保交易号（默认空，下载后回填）
    '0|' || s.shoufeixmid || '|' || s.shoufeixmid AS yiyuandzdm, -- 医院对照代码
    s.shoufeixmmc                         AS yiyuanzlmc,       -- 医院诊疗名称
    NULL                                  AS yiyuanzldwmc,     -- 医院诊疗单位名称
    '1'                                   AS duizhaofs,        -- 对照方式（1=手工对照）
    to_char(now(), 'YYYYMMDD')            AS duizhaoqyrq,      -- 对照起始日期
    NULL                                  AS duizhaozzrq,      -- 对照终止日期
    4                                     AS yibaoshjg,        -- 医保审核结果（4=已对照未提交）
    NULL                                  AS zhenliaoyppb,     -- 诊疗药品排别
    gen_random_uuid()::varchar            AS zidianjlxh,       -- 字典记录序号（唯一主键）
    s.guojiaxmdm                          AS guojiabm,         -- 国家编码 = 国家项目代码
    s.shuruma1                            AS shuruma,          -- 输入码
    CASE
        WHEN s.guojiaxmdm LIKE '%-%' THEN split_part(s.guojiaxmdm, '-', 2)
        ELSE NULL
    END                                   AS shengma,          -- 省码（国家项目代码 '-' 后半部分）
    NULL                                  AS shangchuanrq,     -- 上传日期
    NULL                                  AS shangchuanren,    -- 上传人
    'DBA'                                 AS chuangjianren,    -- 创建人
    now()                                 AS chuangjiansj,     -- 创建时间
    'DBA'                                 AS chuangjianrenxm,  -- 创建人姓名
    0                                     AS zuofeibz,         -- 作废标志（0=正常）
    '1'                                   AS yuanquid,         -- <<< 修改为新医院院区ID
    '0'                                   AS tenantid          -- <<< 修改为租户ID
FROM df_zhushuju.gy_shoufeixm s
WHERE s.guojiaxmdm IS NOT NULL
  AND s.guojiaxmdm <> ''
  AND s.zuofeibz = 0
  AND NOT EXISTS (
      SELECT 1
      FROM df_yibao.yb_zhenliaodmdz d
      WHERE d.yiyuanylxh = s.shoufeixmid
        AND d.yiliaobxid = '105'          -- <<< 与上面 yiliaobxid 保持一致
        AND (d.tenantid = '0' OR d.tenantid IS NULL)
  );


-- ============================================================================
-- 2. 药品目录对照：gy_yaopinmccd -> yb_yaopindmdz
--    条件：guojiaypbm 已维护（非空非空串），且药品未作废
-- ============================================================================
INSERT INTO df_yibao.yb_yaopindmdz (
    yiliaobxid,
    yibaozcbh,
    yiyuanypxh,
    yaopincddm,
    renyuanlbdm,
    yibaoypdm,
    yibaozlbl,
    fufangzlbl,
    yibaojyhm,
    yiyuandzdm,
    yiyuanypmc,
    yiyuanypgg,
    yiyuanypcdmc,
    yiyuanypdw,
    yiyuanyplx,
    yiyuanjxmc,
    yiyuanjxid,
    yiyuanypggid,
    yiyuanypdggid,
    yiyuanhzsrm1,
    duizhaofs,
    duizhaoqyrq,
    duizhaozzrq,
    yibaoshjg,
    zhenliaoyppb,
    yibaoxmlx,
    zidianjlxh,
    guojiabm,
    shuruma,
    shengma,
    shangchuanrq,
    shangchuanren,
    chuangjianren,
    chuangjiansj,
    chuangjianrenxm,
    zuofeibz,
    yaopinzhbl,
    yuanquid,
    tenantid
)
SELECT
    '105'                                 AS yiliaobxid,       -- <<< 修改为新医院医保ID
    1                                     AS yibaozcbh,        -- <<< 修改为实际注册编号
    y.jiageid                             AS yiyuanypxh,       -- 医院药品序号 = 价格ID
    y.chandi                              AS yaopincddm,       -- 药品产地代码
    '*'                                   AS renyuanlbdm,      -- 人员类别（默认全部）
    y.guojiaypbm                          AS yibaoypdm,        -- 医保药品代码 = 国家医保药品编码
    NULL                                  AS yibaozlbl,        -- 医保转换比例
    NULL                                  AS fufangzlbl,       -- 复方转换比例
    NULL                                  AS yibaojyhm,        -- 医保交易号（默认空）
    '0|' || y.jiageid || '|' || y.jiageid AS yiyuandzdm,       -- 医院对照代码
    y.yaopinmc                            AS yiyuanypmc,       -- 医院药品名称
    y.yaopingg                            AS yiyuanypgg,       -- 医院药品规格
    y.chandimc                            AS yiyuanypcdmc,     -- 医院药品产地名称
    y.baozhuangdw                         AS yiyuanypdw,       -- 医院药品单位（包装单位）
    CASE
        WHEN y.yaopinlx ~ '^[0-9]+$' THEN y.yaopinlx::double precision
        ELSE NULL
    END                                   AS yiyuanyplx,       -- 医院药品类型
    (SELECT j.jixingmc FROM df_yaokufang.gy_jixing j WHERE j.jixingid = y.jixing) AS yiyuanjxmc,       -- 医院剂型名称
    y.jixing                              AS yiyuanjxid,       -- 医院剂型ID
    y.guigeid                             AS yiyuanypggid,     -- 医院药品规格ID
    y.daguigeid                           AS yiyuanypdggid,    -- 医院药品大规格ID
    y.shuruma1                            AS yiyuanhzsrm1,     -- 医院含蔗糖输入码1
    '1'                                   AS duizhaofs,        -- 对照方式（1=手工对照）
    to_char(now(), 'YYYYMMDD')            AS duizhaoqyrq,      -- 对照起始日期
    NULL                                  AS duizhaozzrq,      -- 对照终止日期
    4                                     AS yibaoshjg,        -- 医保审核结果（4=已对照未提交）
    1                                     AS zhenliaoyppb,     -- 诊疗药品排别（1=西药）
    NULL                                  AS yibaoxmlx,        -- 医保项目类型
    gen_random_uuid()::varchar            AS zidianjlxh,       -- 字典记录序号（唯一主键）
    y.guojiaypbm                          AS guojiabm,         -- 国家编码 = 国家医保药品编码
    y.shuruma1                            AS shuruma,          -- 输入码
    NULL                                  AS shengma,          -- 省码（药品默认空）
    NULL                                  AS shangchuanrq,     -- 上传日期
    NULL                                  AS shangchuanren,    -- 上传人
    'DBA'                                 AS chuangjianren,    -- 创建人
    now()                                 AS chuangjiansj,     -- 创建时间
    'DBA'                                 AS chuangjianrenxm,  -- 创建人姓名
    0                                     AS zuofeibz,         -- 作废标志（0=正常）
    y.baozhuangliang                      AS yaopinzhbl,       -- 药品转换比例（包装数量）
    '1'                                   AS yuanquid,         -- <<< 修改为新医院院区ID
    '0'                                   AS tenantid          -- <<< 修改为租户ID
FROM df_yaokufang.gy_yaopinmccd y
WHERE y.guojiaypbm IS NOT NULL
  AND y.guojiaypbm <> ''
  AND y.zuofeibz = 0
  AND NOT EXISTS (
      SELECT 1
      FROM df_yibao.yb_yaopindmdz d
      WHERE d.yiyuanypxh = y.jiageid
        AND d.yiliaobxid = '105'          -- <<< 与上面 yiliaobxid 保持一致
        AND (d.tenantid = '0' OR d.tenantid IS NULL)
  );


-- ============================================================================
-- 附：执行后验证
-- ============================================================================
-- SELECT '诊疗对照' AS 表名, count(*) AS 插入数 FROM df_yibao.yb_zhenliaodmdz WHERE chuangjiansj >= now() - interval '1 hour'
-- UNION ALL
-- SELECT '药品对照', count(*) FROM df_yibao.yb_yaopindmdz WHERE chuangjiansj >= now() - interval '1 hour';
