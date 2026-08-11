"""Probe 18: show module 26088 head — find how it builds URLs."""
import re

src = open("module_26088.js", encoding="utf-8").read()
print(src[:3500])
