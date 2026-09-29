import json

from pydantic import ValidationError

from app.schemas.quiz import GeneratedQuiz
from app.services.model_provider import ModelProvider


SUBJECT_NAMES = {"math2": "数学二", "english2": "英语二", "politics": "政治"}


def generate_math_quiz(topic: str) -> GeneratedQuiz:
    if "导数" in topic or "求导" in topic or "微分" in topic:
        questions = [
            {"stem": "函数 f(x)=3x²+2x-1 的导数是？", "options": ["6x+2", "6x+1", "3x+2", "3x-1"], "answer_index": 0, "explanation": "(3x²)'=6x，(2x)'=2，常数项导数为0，所以 f'(x)=6x+2。"},
            {"stem": "函数 f(x)=x³-2x²+5x+7 的导数是？", "options": ["x²-4x+5", "3x²-2x+5", "3x²-4x+5", "3x²-4x+7"], "answer_index": 2, "explanation": "逐项求导得到 3x²-4x+5。"},
            {"stem": "函数 f(x)=x² 在 x=2 处的导数值是？", "options": ["2", "4", "6", "8"], "answer_index": 1, "explanation": "f'(x)=2x，因此 f'(2)=4。"},
        ]
    elif "积分" in topic:
        questions = [
            {"stem": "不定积分 ∫(2x+3)dx 是？", "options": ["2x²+3x+C", "x²+3x+C", "x²+3+C", "2x+3+C"], "answer_index": 1, "explanation": "x²+3x 的导数为 2x+3，因此原积分为 x²+3x+C。"},
            {"stem": "定积分 ∫₀¹ 2x dx 的值是？", "options": ["0", "1/2", "1", "2"], "answer_index": 2, "explanation": "原函数为 x²，代入上下限得到 1²-0²=1。"},
            {"stem": "不定积分 ∫cos(x)dx 是？", "options": ["-sin(x)+C", "cos(x)+C", "-cos(x)+C", "sin(x)+C"], "answer_index": 3, "explanation": "sin(x) 的导数为 cos(x)，因此积分是 sin(x)+C。"},
        ]
    else:
        raise ValueError("数学二小测目前支持导数、求导和积分范围")
    return GeneratedQuiz.model_validate({"questions": questions})


def parse_generated_quiz(raw: str) -> GeneratedQuiz:
    source = raw.strip()
    if source.startswith("```"):
        source = source.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    try:
        quiz = GeneratedQuiz.model_validate_json(source)
    except (ValidationError, ValueError) as error:
        raise ValueError("模型未返回符合要求的三道单选题") from error
    for question in quiz.questions:
        if any(not option.strip() or len(option) > 200 for option in question.options):
            raise ValueError("选项内容不完整或过长")
        if len({option.strip().casefold() for option in question.options}) != 4:
            raise ValueError("单选题含有重复选项")
    return quiz


async def generate_quiz(provider: ModelProvider, subject: str, topic: str, temperature: float) -> GeneratedQuiz:
    subject_rule = "数学题只出可明确验算的具体计算题，不出容易产生多个正确表述的概念辨析题；逐题核对计算和解析。" if subject == "math2" else "每题只能有一个明确正确选项，避免有争议或时效性的事实。"
    messages = [
        {"role": "system", "content": f"你是考研练习题命题助手。只输出合法 JSON，不要 Markdown。每题必须只有一个正确答案，解释要准确且简短。不得声称题目是真题；政治题避免时效性政策和年份事实。{subject_rule}"},
        {"role": "user", "content": f"请围绕{SUBJECT_NAMES[subject]}的“{topic}”生成恰好3道适合自测的单选题。JSON 格式：{{\"questions\":[{{\"stem\":\"题干\",\"options\":[\"选项一\",\"选项二\",\"选项三\",\"选项四\"],\"answer_index\":0,\"explanation\":\"解析\"}}]}}。answer_index 从0到3。"},
    ]
    raw = await provider.chat(messages, temperature)
    try:
        draft = parse_generated_quiz(raw)
    except ValueError:
        repair = await provider.chat([
            {"role": "system", "content": "将下面内容修正为合法 JSON，恰好包含3道四选一单选题。只返回 JSON，不要其他文字。字段为 questions 数组，每题含 stem、options 四项、answer_index 0到3、explanation。"},
            {"role": "user", "content": raw[:6000]},
        ], 0)
        draft = parse_generated_quiz(repair)
    reviewed = await provider.chat([
        {"role": "system", "content": "你是独立审题员。逐题重新求解，检查是否只有一个正确选项、answer_index 与解析是否一致。发现歧义或错误就重写该题。输出完整、合法的相同 JSON，恰好三题，不要 Markdown 或说明。"},
        {"role": "user", "content": json.dumps(draft.model_dump(), ensure_ascii=False)},
    ], 0)
    return parse_generated_quiz(reviewed)


def serialize_quiz(quiz: GeneratedQuiz) -> str:
    return json.dumps(quiz.model_dump()["questions"], ensure_ascii=False)
