-- LingoVibe 词典表结构（Neon Postgres）
-- 以 ECDICT 为主，后续可叠加 CEFR-J 等外部词表。

CREATE TABLE IF NOT EXISTS dict_words (
    word              TEXT PRIMARY KEY,       -- 小写 lemma 形式
    phonetic          TEXT,                   -- 国际音标
    definition_en     TEXT,                   -- 英文释义（可空）
    translation_zh    TEXT,                   -- 中文释义（可空）
    pos               TEXT,                   -- 词性，逗号分隔（n/v/adj/adv/...）
    collins_star      SMALLINT,               -- Collins 星级 1-5，NULL=未收录
    oxford_3000       BOOLEAN DEFAULT FALSE,  -- 是否在 Oxford 3000 内
    tag               TEXT,                   -- zk/gk/cet4/cet6/ky/toefl/ielts/gre 逗号分隔
    bnc_rank          INT,                    -- BNC 频率排名（越小越高频）
    coca_rank         INT,                    -- COCA 频率排名
    cefr              TEXT,                   -- A1 / A2 / B1 / B2 / C1 / C2（叠加后）
    -- 综合难度 1..5：1 入门  2 基础  3 中级  4 进阶  5 高阶
    difficulty_level  SMALLINT NOT NULL
);

-- 词形变化表：从屈折形式 → 词典词（lemma）
-- 例：running → run, better → good, mice → mouse
CREATE TABLE IF NOT EXISTS dict_exchange (
    inflected  TEXT PRIMARY KEY,     -- 小写屈折形式
    lemma      TEXT NOT NULL         -- 小写词典形式，FK-logical → dict_words.word
);

-- 查询索引
CREATE INDEX IF NOT EXISTS idx_dict_difficulty ON dict_words(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_dict_cefr       ON dict_words(cefr) WHERE cefr IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dict_coca       ON dict_words(coca_rank) WHERE coca_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exchange_lemma  ON dict_exchange(lemma);
